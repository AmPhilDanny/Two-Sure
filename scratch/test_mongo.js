const { MongoClient } = require('mongodb');

const passwords = [
    'NeuralBet@Admin2025',
    'NeuralBet%40Admin2025',
    '',
    'bank',
    'blank'
];

async function test() {
    for (const pw of passwords) {
        const url = `mongodb+srv://Vercel-Admin-ai-predictions:${pw}@ai-predictions.4crqnzr.mongodb.net/?retryWrites=true&w=majority&appName=ai-predictions`;
        console.log(`Testing with password: ${pw}`);
        const client = new MongoClient(url);
        try {
            await client.connect();
            console.log(`SUCCESS with password: ${pw}`);
            await client.close();
            return;
        } catch (e) {
            console.log(`FAILED with password: ${pw}: ${e.message}`);
        }
    }
}

test();
