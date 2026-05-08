import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.join(__dirname, "..", "dist");
const assetsDir = path.join(distDir, "assets");

// With pure Vite build, assets are already in dist/assets
// Just verify the build and update index.html if needed
if (fs.existsSync(assetsDir)) {
  const files = fs.readdirSync(assetsDir);
  console.log(`✓ Found ${files.length} files in dist/assets`);

  // Check if index.html exists and has correct asset references
  const indexPath = path.join(distDir, "index.html");
  if (fs.existsSync(indexPath)) {
    let indexHtml = fs.readFileSync(indexPath, "utf-8");

    // Remove crossorigin attribute which can cause issues with local files in Tauri
    if (indexHtml.includes("crossorigin")) {
      indexHtml = indexHtml.replace(/ crossorigin/g, "");
      fs.writeFileSync(indexPath, indexHtml);
      console.log("✓ Removed crossorigin attributes from index.html");
    }
  }
} else {
  console.error("✗ Assets directory not found!");
  process.exit(1);
}

console.log("Build fix complete");
