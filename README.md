# prodex-js

Simple JS library that let you vibe code to the next level!


https://github.com/user-attachments/assets/5fc85e16-0a18-4b97-aa6c-e18e6767a407


## Features

- Component-level prompt;
- Page level prompt;
- Basic vision integration (MCP client can "ask question" to what you see in the screen);
- (Not implemented) Screen capture integration.

## Usage

### Code setup

To use, add the following to the head of your HTML file:

```html
<script name="prodex" src="http://cdn.jsdelivr.net/gh/tarasyarema/prodex-js@v0.1.3/core.min.js?k=test"></script>
```

if you set the `k` the magic components will be loaded, if you do not set it the magic components will not load (e.g. for production builds).

You can set the `@master` to always get the latest version, or a specific version. But it might be "more" unstable.

### MCP setup

Add the foloowing to your MCP setup

```json
{
    "mcpServers": {
        "prodex": {
            "url": "https://prodex-api.onrender.com/mcp/sse?api_key=sk_test"
        }
    }
}
```

you can use `sk_test` as the `api_key` for testing purposes.

Currently I'm hosting the backend myself, but in the future I might open source / distribute a binary so that you can
run the MCP locally, as it might be part of a bigger project.

If you are really interested in the backend or can not use the an external service, please let me know via LinkedIn
and I may give you access / binaries.

### Disclaimers

1. I tested with Cursor, but probably any other editor that has an MCP connection with their agentic code;
2. Currently tested in development in two React based projects (with vite), not sure if it will work with other frameworks.

## Development

Check the [`core.js`](core.js) file for the source code.

## Contributing

Please open a PR, or just DM me in LinkedIn (Taras Yarema) if you have questions.

## License

MIT, see [LICENSE](LICENSE) for more information.
