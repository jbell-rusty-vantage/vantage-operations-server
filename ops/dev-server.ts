import app from "../src/app";
import { readConfig } from "../src/config";

const { port } = readConfig();
const server = app.listen(port, "127.0.0.1", () => {
  console.log(`Moving Operations API listening on http://localhost:${port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
process.on("message", (message) => {
  if (message === "shutdown") shutdown();
});
