import { Hono } from "hono";
import "dotenv/config";

const app = new Hono();
const port = process.env.PORT;

app.get("/", (c) => c.text("Hello World!"));

export default {
  port,
  fetch: app.fetch,
};
