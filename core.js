let globalSelectorEnabled = false;
let globalIsCapturing = false;

let globalBoxes = [];
let globalTooltips = [];

var socket = null;

// const WS_ENDPOINT = 'http://localhost:8001/prodex';
const WS_ENDPOINT = 'https://prodex-api.onrender.com/prodex';

const SERVER_RECONNECT_INTERVAL = 5_000;

// Variables for exponential backoff
const DEFAULT_CAPTURE_INTERVAL = 250;
const MAX_CAPTURE_INTERVAL = 5_000;

const FIBER_FILENAME_REGEX = /fileName: "([^"]+)"/;
const FIBER_LINE_NUMBER_REGEX = /lineNumber: (\d+)/;
const FIBER_COLUMN_NUMBER_REGEX = /columnNumber: (\d+)/;


const PRODEX_STYLES = `
.__prodex_tooltip {
  position: absolute;
  background-color: rgba(0, 0, 0, 0.8);
  color: #fff;
  width: 200px;
  padding: 10px;
  border-radius: 5px;
  white-space: nowrap;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  z-index: 99001;

  input {
    color: #000;
    width: 100%;
    margin-top: 5px;
    padding: 5px;
    border: none;
    border-radius: 3px;
  }
}
.__prodex_button {
  margin: 2px;
  padding: 4px;
  font-size: 14px;
  color: #fff;
  border: 1px solid #fff;
  border-radius: 5px;
  cursor: pointer;
  z-index: 99000;
  width: 120px;
  display: block;
  align-items: center;
}
.__prodex_flex {
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99000;
}
.__prodex_box {
  position: absolute;
  border: 1px solid red;
  border-radius: 4px;
  background-color: rgba(255, 0, 0, 0.05);
  cursor: pointer;
  transition: background-color 0.2s, border 0.2s;
  z-index: 99000;

  :hover {
    background-color: rgba(255, 0, 0, 0.1);
    border: 2px solid red;
  }
}
`;


function randomString(length) {
  var result = '';
  var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  return result;
}

const sessionId = `pd_${randomString(8)}`;

function addStyles() {
  const style = document.createElement('style');
  style.textContent = PRODEX_STYLES;
  document.head.appendChild(style);
}

function maybeInit() {
  var src = document.querySelector('script[name="prodex"]')?.src;

  if (!src) {
    return null;
  }

  return new URL(src).searchParams.get('k');
}

window.onload = function() {
  var maybeK = maybeInit();

  if (maybeK) {
    console.log(`ProdEx initialized with key: ${maybeK}`);

    addStyles();
    setupControls();
    run(maybeK);
  }
}

const newButton = (text, onClick) => {
  var button = document.createElement('button');

  button.className = '__prodex_button';
  button.innerText = text;
  button.onclick = onClick;

  return button;
}

const newFlex = (direction = 'row') => {
  var flex = document.createElement('div');

  flex.className = '__prodex_flex';
  flex.style.flexDirection = direction;

  return flex;
}

const setupControls = () => {
  var controls = newFlex('column');

  controls.style.alignItems = 'flex-start';
  controls.style.position = 'fixed';
  controls.style.bottom = '0px';
  controls.style.left = '0px';

  var captureButton = newButton(`Capture`, function() {
    globalIsCapturing = !globalIsCapturing;

    addLog(new Date().toISOString(), globalIsCapturing ? 'Capture started' : 'Capture stopped');

    captureButton.innerHTML = globalIsCapturing ? `Stop capture` : `Capture`;

    if (globalIsCapturing) {
      startVideoCapture();
    } else {
      // Remove the image
      var img = document.getElementById('prodex_frame');

      if (img) {
        img.remove();
      }

      var video = document.getElementById('prodex_video');

      if (video) {
        video.remove();
      }
    }
  });

  captureButton.id = 'prodex_capture_button';
  captureButton.style.backgroundColor = 'darkred';

  var elementButton = newButton('Do magic!', function() {
    globalSelectorEnabled = !globalSelectorEnabled;

    addLog(new Date().toISOString(), globalSelectorEnabled ? 'Magic started' : 'Magic stopped');

    elementButton.innerHTML = globalSelectorEnabled ? 'Stop magic...' : 'Do magic!';
    elementButton.style.backgroundColor = globalSelectorEnabled ? 'darkgreen' : 'green';

    if (!globalSelectorEnabled) {
      globalBoxes.forEach(b => b.remove());
      document.querySelectorAll('.__prodex_box').forEach(b => b.remove());
      globalBoxes = [];

      globalTooltips.forEach(t => t.remove());
      document.querySelectorAll('.__prodex_tooltip').forEach(t => t.remove());
      globalTooltips = [];
    }
  });

  elementButton.id = 'prodex_element_button';
  elementButton.style.backgroundColor = 'green';

  var feedbackLog = document.createElement('div');

  feedbackLog.id = 'prodex_feedback_log';
  feedbackLog.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
  feedbackLog.style.color = 'white';
  feedbackLog.style.padding = '10px';
  feedbackLog.style.border = '1px solid rgba(255, 255, 255, 0.5)';
  feedbackLog.style.borderRadius = '5px';
  feedbackLog.style.marginTop = '5px';
  feedbackLog.style.width = '360px';
  feedbackLog.style.height = '240px';
  feedbackLog.style.overflow = 'auto';

  controls.appendChild(feedbackLog);
  controls.appendChild(captureButton);
  controls.appendChild(elementButton);

  document.body.appendChild(controls);

  addLog(new Date().toISOString(), 'ProdEx initialized');
  addLog(new Date().toISOString(), 'Press `Meta + K` in Magic mode to send page level feedback');
  addLog(new Date().toISOString(), `Start an new composer chat (agent) with:\nStart a ProdEx session with id = "${sessionId}"`);
}


const addLog = (time, message, role) => {
  var log = document.getElementById('prodex_feedback_log');

  if (!log) {
    return;
  }

  var t = newFlex('column');

  t.style.marginBottom = '5px';
  t.style.borderBottom = '1px solid rgba(255, 255, 255, 0.5)';
  t.style.paddingBottom = '5px';
  t.style.flex = '1';

  if (role === 'user') {
    t.style.alignItems = 'flex-end';
  } else {
    t.style.alignItems = 'flex-start';
  }

  var timeSpan = document.createElement('code');

  timeSpan.innerText = time;
  timeSpan.style.color = 'rgba(255, 255, 255, 0.6)';
  timeSpan.style.marginRight = '10px';
  timeSpan.style.fontSize = '10px';

  var p = document.createElement('p');

  p.innerText = message;
  p.style.fontSize = '14px';

  t.appendChild(timeSpan);
  t.appendChild(p);

  log.appendChild(t);

  // Auto-scroll to the bottom
  log.scrollTop = log.scrollHeight;
}

const startFrameCapture = async (fn, format) => {
  const video = document.createElement('video');

  video.style.display = 'none'; // Hide the video element
  video.id = 'prodex_video';

  document.body.appendChild(video);

  try {
    // Obtain the display media stream
    const captureStreamMedia = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: "browser"
      },
      video: true,
      selfBrowserSurface: "include",
      monitorTypeSurfaces: "exclude"
    });

    let stopCapture = false;

    captureStreamMedia.getVideoTracks().forEach((track) => {
      track.addEventListener('ended', () => {
        stopCapture = true;
      })
    });

    video.srcObject = captureStreamMedia;

    // Wait for the video metadata to be loaded
    await new Promise((resolve) => {
      video.onloadedmetadata = resolve;
    });

    // Play the video
    await video.play();

    // Set up a canvas to draw video frames
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    let isActive = false;
    let captureInterval = DEFAULT_CAPTURE_INTERVAL;

    // Function to capture and send a frame
    const captureFrame = async () => {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frameData = canvas.toDataURL(format ?? 'image/png');
      return fn(frameData);
    };

    // Function to handle exponential backoff
    const handleBackoff = async () => {
      if (!isActive) {
        const ok = await captureFrame();

        if (!ok) {
          stopCapture = true;
          return;
        }

        captureInterval = Math.min(captureInterval * 1.2, MAX_CAPTURE_INTERVAL);
      } else {
        isActive = false;
        captureInterval = DEFAULT_CAPTURE_INTERVAL;
      }

      setTimeout(handleBackoff, captureInterval);
    };

    // Event listeners for user activities
    const userActivityHandler = async () => {
      isActive = true;
      await captureFrame();
    };

    ['mousemove', 'click', 'keydown', 'keypress', 'scroll', 'focus'].forEach((event) => {
      window.addEventListener(event, userActivityHandler);
    });

    // Start the backoff handler
    await handleBackoff();

    for (; ;) {
      if (stopCapture) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log('Stopping frame capture');

    // Return a function to stop the frame capture
    return () => {
      console.log('Stopping frame capture, child');

      // Remove the video capture
      try {
        video.srcObject.getTracks().forEach((track) => track.stop());
      } catch (err) {
        console.error('Error stopping video tracks:', err);
      }

      video.remove();
      canvas.remove();

      ['mousemove', 'click', 'keydown', 'keypress', 'scroll', 'focus'].forEach((event) => {
        window.removeEventListener(event, userActivityHandler);
      });
    };

  } catch (err) {
    console.error(`Error capturing screen: ${err}`);
  }

  return () => {
    console.log('Stopping frame capture, parent');
    video.remove();
  };
};

function takeScreenshot(cb) {
  startFrameCapture((frameData) => {
    console.log(`Single frame captured: ${frameData.length} bytes`);

    cb(frameData);

    return false;
  }, 'image/jpeg').then((onClose) => {
    onClose();
  });
}

function startVideoCapture() {
  startFrameCapture((frameData) => {
    if (!globalIsCapturing) {
      return false;
    }

    console.log(`New frame captured: ${frameData.length} bytes`);

    var img = document.getElementById('prodex_frame');

    if (img) {
      img.src = frameData;
      return true;
    }

    img = document.createElement('img');

    img.id = 'prodex_frame';

    img.src = frameData;
    img.style.position = 'absolute';

    // Middle of screen
    img.style.top = '250px';
    img.style.left = '250px';

    img.style.zIndex = '99000';

    // Set the image size to 25% of the window dimensions
    img.style.width = Math.round(window.innerWidth * 0.5) + 'px';
    img.style.height = Math.round(window.innerHeight * 0.5) + 'px';

    // Add a border to the image
    img.style.border = '1px solid black';

    // Append the image to the document body
    document.body.appendChild(img);

    return true;
  }).then((onClose) => {
    onClose();
  });
}

function addBox(name, width, height, top, left, className, cb) {
  var box = document.createElement('div');

  box.className = '__prodex_box';

  if (className) {
    box.className = className;
  }

  box.id = `__prodex_box--${new Date().getTime()}`;
  box.style.width = width + 'px';
  box.style.height = height + 'px';
  box.style.top = top + 'px';
  box.style.left = left + 'px';

  box.addEventListener('click', function(ev) {
    ev.preventDefault();
    ev.stopPropagation();


    globalBoxes.forEach(b => b.id !== box.id && b.remove());
    document.querySelectorAll('.__prodex_box').forEach(b => b.id !== box.id && b.remove());
    globalBoxes = globalBoxes.filter(b => b.id === box.id);

    globalTooltips.forEach(t => t.remove());
    globalTooltips = globalTooltips.filter(t => t.id === box.id);

    var div = newFlex();

    div.style.position = 'absolute';
    div.id = `__prodex_tooltip-flex--${box.id}`;

    // To the cursor position
    div.style.top = ev.pageY + 'px';
    div.style.left = ev.pageX + 'px';

    div.style.width = '320px';
    div.style.display = 'flex';
    div.style.flex = '1';
    div.style.flexDirection = 'column';

    var tooltip = document.createElement('div');

    tooltip.className = '__prodex_tooltip';
    tooltip.id = `__prodex_tooltip--${box.id}`;

    tooltip.style.width = '100%';
    tooltip.innerText = `What do you want to do?`;

    var input = document.createElement('input');

    input.placeholder = 'Your input here';
    input.style.width = '100%';

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        addLog(
          new Date().toISOString(),
          input.value,
          'user'
        );

        cb(input.value);

        // Remove all tooltips
        globalBoxes.forEach(b => b.remove());
        document.querySelectorAll('.__prodex_box').forEach(b => b.remove());
        globalBoxes = [];

        globalTooltips.forEach(t => t.remove());
        document.querySelectorAll('.__prodex_tooltip').forEach(t => t.remove());
        globalTooltips = [];
      } else if (e.key === 'Escape') {
        e.preventDefault();

        globalTooltips.forEach(t => t.remove());
        document.querySelectorAll('.__prodex_tooltip').forEach(t => t.remove());
        globalTooltips = [];

        div.remove();
      }
    });

    tooltip.appendChild(input);
    div.appendChild(tooltip);

    document.body.appendChild(div);

    globalTooltips.push(tooltip);
    globalTooltips.push(div);

    input.focus();
  });

  box.addEventListener('mouseout', function() {
    // Remove the box after 1 second
    setTimeout(function() {
      box.remove();

      document.querySelectorAll('.__prodex_box').forEach(b => b.id !== box.id && b.remove());
      globalBoxes = globalBoxes.filter(b => b.id === box.id);
    }, 100);
  });

  document.body.appendChild(box);

  globalBoxes.push(box);
}

async function run(k) {
  initializeWebSocket(
    k,
    (message) => {
      switch (message.data?.type) {
        case 'screenshot': {
          takeScreenshot(function(data) {
            socket?.send(JSON.stringify({
              type: 'screenshot',
              data: {
                key: k,
                location: window.location,
                image: data,
              }
            }));
          });

          break;
        }
        case 'feedback': {
          addLog(new Date().toISOString(), message.data.feedback);
          break;
        }
      }
    },
    (s) => {
      setupDev(function(data) {
        const enrichedData = JSON.stringify({
          ...data,
          key: k,
          location: window.location,
        });

        s.send(enrichedData);
      });

      setupCmdK(function(data) {
        const enrichedData = JSON.stringify({
          ...data,
          key: k,
          location: window.location,
        });

        s.send(enrichedData);
      });
    }
  );
}

function setupCmdK(cb) {
  document.addEventListener('keydown', function(e) {
    if (!globalSelectorEnabled) {
      return;
    }

    if (e.composed && e.key === 'k' && e.metaKey) {
      globalTooltips.forEach(t => t.remove());
      document.querySelectorAll('.__prodex_tooltip').forEach(t => t.remove());
      globalTooltips = [];

      var div = newFlex();

      div.style.position = 'fixed';
      div.style.top = '50%';
      div.style.left = '50%';
      div.style.width = '600px';
      div.style.display = 'flex';
      div.style.flex = '1';
      div.style.flexDirection = 'column';
      div.style.transform = 'translate(-50%, -50%)';

      var tooltip = document.createElement('div');

      tooltip.className = '__prodex_tooltip';

      tooltip.innerText = `What do you want to do?`;
      tooltip.style.width = '100%';

      var input = document.createElement('input');

      input.placeholder = 'Your input here...';
      input.style.width = '100%';

      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          addLog(
            new Date().toISOString(),
            input.value,
            'user'
          );

          cb({
            type: 'user_input',
            data: {
              input: input.value,
              page_location: {
                x: e.pageX,
                y: e.pageY,
              },
              component: {},
            }
          });

          globalTooltips.forEach(t => t.remove());
          globalTooltips = [];

          div.remove();
        } else if (e.key === 'Escape') {
          e.preventDefault();

          globalTooltips.forEach(t => t.remove());
          globalTooltips = [];

          div.remove();
        }
      });

      tooltip.appendChild(input);
      div.appendChild(tooltip);

      document.body.appendChild(div);

      globalTooltips.push(tooltip);
      globalTooltips.push(div);

      input.focus();
    }
  });
}

/**
 * Hacky function that relies on React internals
 * to get the component name, file name, line number.
 *
 * It will only really work in development envs.
 */
function getReactInfo(node, depth = 0) {
  if (depth > 4) {
    return null;
  }

  if (node?.return?.type?.name) {
    const s = node.return.type.toString();

    const fileNameMatch = s.match(FIBER_FILENAME_REGEX);
    const lineNumberMatch = s.match(FIBER_LINE_NUMBER_REGEX);
    const columnNumberMatch = s.match(FIBER_COLUMN_NUMBER_REGEX);

    return {
      node,
      name: node.return.type.name,
      fileName: fileNameMatch ? fileNameMatch[1] : null,
      lineNumber: lineNumberMatch ? parseInt(lineNumberMatch[1]) : null,
      columnNumber: columnNumberMatch ? parseInt(columnNumberMatch[1]) : null,
    };
  }

  // Vite
  if (node?._debugSource) {
    return {
      node,
      name: node.type,
      fileName: node._debugSource?.fileName,
      lineNumber: node._debugSource?.lineNumber,
      columnNumber: node._debugSource?.columnNumber,
    };
  }

  // Vite
  if (node?.child) {
    return getReactInfo(node.child, depth + 1);
  }

  return null;
}

/**
 * Get the React Fiber node from the DOM node
 */
function getReactFiber(dom) {
  for (const key in dom) {
    if (key.startsWith('__reactFiber$')) {
      return dom[key];
    }
  }

  return null;
}

function setupDev(cb) {
  document.onmousemove = function(e) {
    if (!globalSelectorEnabled) {
      return;
    }

    var eles = document.elementsFromPoint(e.clientX, e.clientY).filter(e => !e.className.includes('__prodex'));

    if (eles.length === 0) {
      return;
    }

    var fiberNode = null;
    var ele = null;

    for (var i = 0; i < eles.length; i++) {
      ele = eles[i];
      var maybeFiber = getReactFiber(ele);

      if (maybeFiber) {
        fiberNode = getReactInfo(maybeFiber, 0);
        break;
      }
    }

    if (!fiberNode) {
      return;
    }

    // Remove all boxes
    globalBoxes.forEach(b => b.remove());
    document.querySelectorAll('.__prodex_box').forEach(b => b.remove());
    globalBoxes = [];

    const rect = ele.getBoundingClientRect();

    // Add box for the component
    addBox(
      fiberNode.name,
      rect.width,
      rect.height,
      rect.top + window.scrollY,
      rect.left + window.scrollX,
      undefined,
      function(input) {
        cb({
          type: 'user_input',
          data: {
            input,
            page_location: {
              x: e.pageX,
              y: e.pageY,
            },
            component: {
              name: fiberNode.name,
              fileName: fiberNode.fileName,
              lineNumber: fiberNode.lineNumber,
              columnNumber: fiberNode.columnNumber,
            }
          }
        })
      }
    );
  }
}

function initializeWebSocket(
  k,
  onmessage,
  send_cb
) {
  socket = new WebSocket(WS_ENDPOINT);

  socket.onopen = function() {
    console.debug(`ProdEx WebSocket connected`);

    socket.send(
      JSON.stringify({
        type: 'js_init',
        data: {
          key: k,
          id: sessionId
        }
      })
    );

    send_cb(socket);
  };

  socket.onmessage = function(event) {
    onmessage(JSON.parse(event.data));
  };

  socket.onerror = function(error) {
    console.error(`ProdEx WebSocket error: ${error.message}`);
  };

  socket.onclose = function(event) {
    console.warn(`ProdEx WebSocket closed: ${event.reason}. Reconnecting in ${SERVER_RECONNECT_INTERVAL / 1000} seconds.`);

    setTimeout(
      function() {
        initializeWebSocket(
          k,
          onmessage,
          send_cb
        );
      },
      SERVER_RECONNECT_INTERVAL
    );
  };
}
