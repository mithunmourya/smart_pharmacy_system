
module.exports = {
    testEnvironment: "node",

    roots: [
        "<rootDir>/tests/unit testing"
    ],

    collectCoverageFrom: [
        "app.js",
        "controllers/**/*.js",
        "services/**/*.js",
        "middleware/**/*.js",
        "routes/**/*.js",
        "models/**/*.js",
        "utils/**/*.js"
    ],

    coverageDirectory: "coverage/unit"
};
