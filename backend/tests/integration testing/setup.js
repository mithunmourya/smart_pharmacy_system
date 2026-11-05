
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({
    path: path.resolve(__dirname, "../../.env.test"),
    override: true,
    quiet: true
});

if (!process.env.DB_NAME) {
    throw new Error(
        "Integration test database is not configured."
    );
}

if (process.env.DB_NAME !== "smart_pharmacy_test") {
    throw new Error(
        `Unsafe integration database: ${process.env.DB_NAME}. Expected smart_pharmacy_test.`
    );
}
