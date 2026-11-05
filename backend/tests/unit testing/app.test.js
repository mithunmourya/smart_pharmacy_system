const request = require("supertest");
const app = require("../../app");

test("GET / should return 200", async () => {
  const response = await request(app).get("/");

  expect(response.status).toBe(200);
  expect(response.body.success).toBe(true);
});