# Syntax parser downloads

The repository contains only `parser-manifest.json` and the downloader, not the upstream binaries. `npm run prepare:parsers` downloads the exact npm package versions with `npm pack --ignore-scripts`, copies only the listed members and verifies every SHA-256 digest before replacing `site/vendor/tree-sitter/`. Matching local files are reused without a network request. A failed download or checksum check stops the workflow before deployment.

The generated upstream artifacts are copied verbatim from the official npm packages. They are loaded only for the source-code comparison mode, from the same origin as tinyDiff. No CDN, npm install, upstream package scripts or server-side parser is involved. The preparation step requires Node.js, npm, tar and registry access; the deployed website does not.

| Package                | Version | Upstream                                              | License                               |
| ---------------------- | ------- | ----------------------------------------------------- | ------------------------------------- |
| web-tree-sitter        | 0.27.1  | https://github.com/tree-sitter/tree-sitter            | MIT, `web-tree-sitter.LICENSE`        |
| tree-sitter-go         | 0.25.0  | https://github.com/tree-sitter/tree-sitter-go         | MIT, `tree-sitter-go.LICENSE`         |
| tree-sitter-python     | 0.25.0  | https://github.com/tree-sitter/tree-sitter-python     | MIT, `tree-sitter-python.LICENSE`     |
| tree-sitter-c          | 0.24.1  | https://github.com/tree-sitter/tree-sitter-c          | MIT, `tree-sitter-c.LICENSE`          |
| tree-sitter-cpp        | 0.23.4  | https://github.com/tree-sitter/tree-sitter-cpp        | MIT, `tree-sitter-cpp.LICENSE`        |
| tree-sitter-rust       | 0.24.0  | https://github.com/tree-sitter/tree-sitter-rust       | MIT, `tree-sitter-rust.LICENSE`       |
| tree-sitter-javascript | 0.25.0  | https://github.com/tree-sitter/tree-sitter-javascript | MIT, `tree-sitter-javascript.LICENSE` |
| tree-sitter-typescript | 0.23.2  | https://github.com/tree-sitter/tree-sitter-typescript | MIT, `tree-sitter-typescript.LICENSE` |

`parser-manifest.json` records each file's package, version and SHA-256 digest. The downloader and dependency tests verify the artifacts and the presence of their licenses. The upstream runtime includes Node-only imports, which are not called by the browser loader. Runtime and grammar bytes are supplied explicitly; upstream network loading is not used.

To update, select compatible versions from the upstream projects above, inspect the package artifacts, then update versions, member paths and SHA-256 digests in `parser-manifest.json`. Never replace a digest just to make a failed download pass.

Run `npm run prepare:parsers`, `npm test` and `tests/browser.html` after changes. Check grammar ABI compatibility and the production CSP in a real browser. The generated `site/vendor/tree-sitter/README.md` and the upstream license files are included in the Pages artifact. Debug builds, source maps, native bindings and package install scripts are not distributed.

See [npm pack](https://docs.npmjs.com/cli/v11/commands/npm-pack/) for the package-download and `--ignore-scripts` options.
