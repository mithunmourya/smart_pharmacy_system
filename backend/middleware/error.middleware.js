const { serverError } = require("../utils/response");

const errorMiddleware = (err, req, res, next) => {

    console.error(err);

    const response = serverError("Internal Server Error.");

    res
        .status(response.status)
        .json(response);
};

module.exports = errorMiddleware;