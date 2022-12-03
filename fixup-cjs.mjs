import fs from "fs/promises";

await fs.writeFile("build/cjs/package.json", JSON.stringify({ type: "commonjs" }));
