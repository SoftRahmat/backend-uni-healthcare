import app from "./app";
const port = 5000; // The port your express server will be running on.


const bootsrap = () => {
    try {
        app.listen(process.env.PORT || port, () => {
            console.log(`Server is running on http://localhost:${port}`);
        });
    } catch (error) {
        console.error("Error during server initialization:", error);
    }
}

bootsrap();