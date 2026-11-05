
module.exports = {
    testEnvironment: "node",

    roots: [
        "<rootDir>/tests/integration testing"
    ],

    setupFiles: [
        "<rootDir>/tests/integration testing/setup.js"
    ],

    maxWorkers: 1,

    coverageDirectory: "coverage/integration"
};
