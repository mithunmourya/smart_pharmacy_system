// Load environment variables from your .env file at the absolute start
require("dotenv").config();

const app = require("./app");

// Define Port (Defaulting to 5000 as per your setup)
const PORT = process.env.PORT || 5000;

// Start listening for incoming traffic
app.listen(PORT, () => {
    console.log(`🚀 Server is successfully running on port ${PORT}`);
});