const ok = (message, data = null) => ({
    status: 200,
    success: true,
    message,
    data
});

const created = (message, data = null) => ({
    status: 201,
    success: true,
    message,
    data
});

const badRequest = (message, data = null) => ({
    status: 400,
    success: false,
    message,
    data
});

const unauthorized = (message, data = null) => ({
    status: 401,
    success: false,
    message,
    data
});

const forbidden = (message, data = null) => ({
    status: 403,
    success: false,
    message,
    data
});

const notFound = (message, data = null) => ({
    status: 404,
    success: false,
    message,
    data
});

const conflict = (message, data = null) => ({
    status: 409,
    success: false,
    message,
    data
});

const serverError = (message, data = null) => ({
    status: 500,
    success: false,
    message,
    data
});

module.exports = {
    ok,
    created,
    badRequest,
    unauthorized,
    forbidden,
    notFound,
    conflict,
    serverError
};