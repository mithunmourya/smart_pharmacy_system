const request = require("supertest");
const app = require("../../app");

describe("404 Not Found Handler", () => {

    test("should return 404 for an unknown endpoint", async () => {

        const response = await request(app)
            .get("/this-route-does-not-exist");

        expect(response.status).toBe(404);

        expect(response.body).toEqual({
            status: 404,
            message: "Endpoint /this-route-does-not-exist not found."
        });
    });


    test("should include the requested URL in the error message", async () => {

        const response = await request(app)
            .get("/abc/xyz");

        expect(response.status).toBe(404);

        expect(response.body.message).toBe(
            "Endpoint /abc/xyz not found."
        );
    });


    test("should return 404 for an unknown POST endpoint", async () => {

        const response = await request(app)
            .post("/unknown-endpoint");

        expect(response.status).toBe(404);

        expect(response.body).toEqual({
            status: 404,
            message: "Endpoint /unknown-endpoint not found."
        });
    });

});