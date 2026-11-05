const jwt = require("jsonwebtoken");

const userModel = require("../models/user.model");
const { unauthorized } = require("../utils/response");

const authenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res
            .status(401)
            .json(
                unauthorized("Access token is required.")
            );
    }

    const token = authHeader.slice(7).trim();

    if (!token) {
        return res
            .status(401)
            .json(
                unauthorized("Access token is required.")
            );
    }

    let decoded;

    // ==========================================
    // 1. Verify Token Signature and Expiration
    // ==========================================

    try {
        decoded = jwt.verify(
            token,
            process.env.JWT_SECRET,
            {
                algorithms: ["HS256"]
            }
        );
    } catch (error) {
        if (
            error.name === "JsonWebTokenError" ||
            error.name === "TokenExpiredError" ||
            error.name === "NotBeforeError"
        ) {
            return res
                .status(401)
                .json(
                    unauthorized("Invalid or expired token.")
                );
        }

        return next(error);
    }

    // ==========================================
    // 2. Validate Required Token Fields
    // ==========================================

    if (
        !decoded ||
        typeof decoded !== "object" ||
        !Number.isSafeInteger(decoded.userId) ||
        decoded.userId <= 0 ||
        !Number.isSafeInteger(decoded.token_version) ||
        decoded.token_version < 0 ||
        !Number.isFinite(decoded.exp)
    ) {
        return res
            .status(401)
            .json(
                unauthorized(
                    "Your session is no longer valid. Please sign in again."
                )
            );
    }

    // ==========================================
    // 3. Check Current Account State
    // ==========================================

    try {
        const user = await userModel.getUserAuthById(
            decoded.userId
        );

        if (!user) {
            return res
                .status(401)
                .json(
                    unauthorized(
                        "Your account is no longer available."
                    )
                );
        }

        if (Number(user.is_active) !== 1) {
            return res
                .status(401)
                .json(
                    unauthorized(
                        "Your account has been deactivated. Please contact the administrator."
                    )
                );
        }

        const currentVersion = Number(user.token_version);

        if (
            user.token_version == null ||
            !Number.isSafeInteger(currentVersion) ||
            currentVersion < 0
        ) {
            return next(
                new Error("Invalid account token-version configuration.")
            );
        }

        if (decoded.token_version !== currentVersion) {
            return res
                .status(401)
                .json(
                    unauthorized(
                        "Your session has been revoked. Please sign in again."
                    )
                );
        }

        // Use the current database values for authorization.
        req.user = {
            userId: Number(user.user_id),
            email: user.email,
            role: user.role,
            token_version: currentVersion
        };
    } catch (error) {
        // Database failures go to the error middleware.
        // They must not be reported as invalid login tokens.
        return next(error);
    }

    return next();
};

module.exports = authenticate;