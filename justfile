build:
  bun run build

check:
  bun run check

watch:
  ag -l --js | entr ./build.js

package: build
  bun run package
