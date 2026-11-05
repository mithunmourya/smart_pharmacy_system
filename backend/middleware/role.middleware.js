const {
    forbidden
} = require("../utils/response");

// Updated authorize middleware
const authorize = (...roles) => {
    return (req, res, next) => {
        // Defensive check to ensure the user object exists
        if (!req.user || !req.user.role) {
            return res.status(401).json(forbidden("User context missing. Authentication required."));
        }
        
        if (!roles.includes(req.user.role)) {
            return res
                .status(403)
                .json(forbidden("You are not authorized to access this resource."));
        }

        next();
    };
};
module.exports = authorize;