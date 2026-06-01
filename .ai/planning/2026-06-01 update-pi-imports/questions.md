# Questions & Answers

Questions are added in chronological order to this file; new questions are added at the bottom.

## Q1: Version constraints for updated packages

`web-tools/package.json` pins `@mariozechner/pi-ai` at `^0.73.0` and `pi-mcp-adapter/package.json` pins it at `^0.70.2`. The new `@earendil-works/pi-ai` starts at `0.74.0`. Should the version constraints be updated to `^0.74.0` (or latest), or should they be kept as-is and rely on `npm install` to resolve the highest compatible version?

### Response

As for web-tools, please pin to 0.75. The fact that you mentioned pi-mcp-adapter makes me realise that you didn't follow the initial prompt: pi-mcp-adapter is not in this repo, it's in my home directory's Pi config folder which I do not want you to touch. This project is exclusively about this repository. Please update the plan accordingly.
<!-- Processed -->

