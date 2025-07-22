const fs = require('fs');
const path = require('path');
const db = require('./models/db'); // Adjust this path if your db.js is elsewhere

const productsFilePath = path.join(__dirname, 'products.json'); // Adjust this path if products.json is in a subdirectory

fs.readFile(productsFilePath, 'utf8', (err, data) => {
    if (err) {
        console.error('Error reading products.json:', err);
        return;
    }
    try {
        const products = JSON.parse(data);

        products.forEach(product => {
            // Ensure profit and capital_required are present, default if not
            const profit = product.profit !== undefined ? parseFloat(product.profit) : 0.00;
            const capital_required = product.capital_required !== undefined ? parseFloat(product.capital_required) : 0.00;

            const sql = `
                INSERT INTO products (id, name, description, price, profit, capital_required, image_url)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    name = VALUES(name),
                    description = VALUES(description),
                    price = VALUES(price),
                    profit = VALUES(profit),
                    capital_required = VALUES(capital_required),
                    image_url = VALUES(image_url);
            `; // ON DUPLICATE KEY UPDATE handles existing IDs (if any)

            db.query(sql, [
                product.id,
                product.name,
                product.description,
                parseFloat(product.price),
                profit,
                capital_required,
                product.image // Assuming product.image holds the URL
            ], (insertErr, result) => {
                if (insertErr) {
                    console.error(`Error inserting/updating product ${product.id}:`, insertErr);
                } else {
                    console.log(`Product ${product.id} processed.`, result);
                }
            });
        });

        console.log('Product migration script finished attempting to process all products.');
    } catch (parseErr) {
        console.error('Error parsing products.json:', parseErr);
    } finally {
        // If your db connection needs explicit closing, uncomment this:
        // if (db && typeof db.end === 'function') {
        //     db.end();
        // }
    }
});