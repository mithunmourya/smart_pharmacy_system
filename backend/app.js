const express = require("express");
const cors = require("cors");

const medicineRoutes = require("./routes/medicine.routes");
const userRoutes = require("./routes/user.routes");
const manufacturerRoutes = require("./routes/manufacturer.routes");
const batchRoutes=require("./routes/batch.routes")
const salesRoutes=require("./routes/sales.routes")

const errorMiddleware = require("./middleware/error.middleware");


const app = express();


// Global Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// Base Route
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "Smart Pharmacy Backend Running 🚀"
    });
});



app.use("/users", userRoutes);
app.use("/manufacturers",manufacturerRoutes);
app.use("/medicines", medicineRoutes);
app.use("/batches",batchRoutes);
app.use("/sales",salesRoutes);

// 404 Handler
app.use((req, res) => {
    res.status(404).json({
        status: 404,
        message: `Endpoint ${req.originalUrl} not found.`
    });
});


// Global Error Handler
app.use(errorMiddleware);

module.exports = app;