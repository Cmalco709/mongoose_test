const express = require("express")
const mongoose = require("mongoose")
const dotenv = require("dotenv")

dotenv.config();

const app = express()
const port = process.env.PORT || 3000;

app.use(express.json());

// import the collection models
const GroceryItem = require("./models/GroceryItem");
const Employee = require("./models/Employee");
// create a mapping object based on the models
const modelMapping = {
    GroceryInventory: GroceryItem,
    Employees: Employee,
};

const connections = {}
const models = {}
const bankUserSchema = new mongoose.Schema({});

const getConnection = async (dbName) => {
    console.log('getConnection called with dbName:', dbName);
    if (!connections[dbName]) {
        connections[dbName] = await mongoose.createConnection(process.env.MONGO_URI, { dbName: dbName, autoIndex: false });
        // Await the 'open' event to ensure the connection is established
        await new Promise((resolve, reject) => {
            connections[dbName].once("open", resolve);
            connections[dbName].once("error", reject);
        });
        console.log('New connection created for database:', dbName);
    } else {
        console.log('Reusing existing connection for database:', dbName);
    }
    return connections[dbName];
}

const getModel = async (dbName, collectionName) => {
    console.log("getModel called with:", { dbName, collectionName });
    const modelKey = `${dbName}-${collectionName}`;
    if (!models[modelKey]) {
        const connection = await getConnection(dbName);
        // Create a dynamic schema that accepts any fields
        const Model = modelMapping[collectionName];
        if (!Model) {
            // Use a dynamic schema with autoIndex disabled if no model is found
            const dynamicSchema = new mongoose.Schema(
                {},
                { strict: false, autoIndex: false }
            );
            models[modelKey] = connection.model(
                collectionName,
                dynamicSchema,
                collectionName
            );
            console.log(`Created dynamic model for collection: ${collectionName}`);
        } else {
            // Use the predefined model's schema with autoIndex already disabled
            models[modelKey] = connection.model(
                Model.modelName,
                Model.schema,
                collectionName // Use exact collection name from request
            );
            console.log("Created new model for collection:", collectionName);
        }
    }
    return models[modelKey];
};

app.get('/find/:database/:collection', async (req, res) => {
    try {
        const { database, collection } = req.params;
        const Model = await getModel(database, collection);
        const documents = await Model.find({}).lean();
        console.log('Query executed, document count:', documents.length);
        res.status(200).json(documents);
    } catch (err) {
        console.error('Error in GET route:', err);
        res.status(500).json({ error: err.message });
    }
})

app.post('/insert/:database/:collection', async (req, res) => {
    try {
        // Extract the request parameters using destructuring
        const { database, collection } = req.params
        // Get the request body and store it as data
        const data = req.body;
        // Get the appropriate Mongoose model
        const Model = await getModel(database, collection);
        // Create a new instance of that model with the data
        const newDocument = new Model(data);
        // const result = await Model.collection(collection).insertOne(data);
        // Save the new document to the database
        await newDocument.save();
        // Log a success message to the console
        console.log("successfully saved new document")
        // Send back the newly created document as JSON with a 201 status code
        res.status(201).json({ message: `Document saved successfully`, document: newDocument })
    } catch (err) {
        // Log any errors to the console
        res.status(400).json({ error: err.message });
        // Send back a 400 status code and the error message in the response
    }
});

app.put('/update/:database/:collection/:id', async (req, res) => {
    try {
        const { database, collection, id } = req.params
        const data = req.body
        const Model = await getModel(database, collection);
        const updatedDocument = Model.findByIdAndUpdate(id, data, { new: true, runValidators: true });
        if (!updatedDocument) {
            return res.status(404).json({ message: `id not found` });
        }
        res.status(200).json({ message: `Document updated successfully`, document: newDocument })
    } catch (err) {
        console.error("There was an error updating", err)
        res.status(400).json({ error: err.message });
    }
});

app.delete('/delete/:database/:collection/:id', async (req, res) => {
    try {
        const { database, collection, id } = req.params
        const Model = await getModel(database, collection);
        const deletedDocument = Model.findByIdAndDelete(id);
        if (!deletedDocument) {
            return res.status(404).json({ error: `Document not found` });
        }
        res.status(200).json({ message: `Document deleted successfully` })
    } catch (err) {
        console.error("There was an error deleting", err)
        res.status(400).json({ error: err.message });
    }
});

async function startServer() {
    try {
        app.listen(port, () => {
            console.log(`Server running on http://localhost:${port}`);
        });
    } catch (err) {
        console.error("Error starting server:", err);
        process.exit(1);
    }
}

// DELETE route to delete a specific collection in a database
app.delete("/delete-collection/:database/:collection", async (req, res) => {
    try {
        const { database, collection } = req.params;
        const connection = await getConnection(database); // Establish or retrieve the connection
        // Check if the collection exists
        const collections = await connection.db
            .listCollections({ name: collection })
            .toArray();
        const collectionExists = collections.length > 0;
        if (!collectionExists) {
            return res
                .status(404)
                .json({
                    error: `Collection '${collection}' does not exist in database '${database}'.`,
                });
        }
        // Drop the collection
        await connection.db.dropCollection(collection);
        console.log(
            `Collection '${collection}' deleted from database '${database}'.`
        );
        // Remove the model associated with this collection
        const modelKey = `${database}-${collection}`;
        delete models[modelKey];
        res.status(200).json({
            message: `Collection '${collection}' has been successfully deleted from database '${database}'`
        });
    } catch (err) {
        console.error("Error deleting collection:", err);
        res
            .status(500)
            .json({ error: "An error occurred while deleting the collection." });
    }
});

startServer();