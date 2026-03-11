require('dotenv').config();
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/discord-app', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const shopItemSchema = new mongoose.Schema({
  itemId: String,
  name: String,
  description: String,
  price: Number,
  category: String,
  image: String,
  createdAt: { type: Date, default: Date.now }
});

const ShopItem = mongoose.model('ShopItem', shopItemSchema);

const defaultItems = [
  {
    itemId: uuidv4(),
    name: 'Discord Nitro Badge',
    description: 'Show off your premium status',
    price: 500,
    category: 'badges'
  },
  {
    itemId: uuidv4(),
    name: 'Custom Profile Border',
    description: 'Personalize your profile',
    price: 300,
    category: 'profile'
  },
  {
    itemId: uuidv4(),
    name: 'Custom Status',
    description: 'Set a custom status message',
    price: 200,
    category: 'status'
  },
  {
    itemId: uuidv4(),
    name: 'Emote Pack',
    description: 'Get exclusive emotes',
    price: 250,
    category: 'emotes'
  },
  {
    itemId: uuidv4(),
    name: 'Pink Theme',
    description: 'UI theme customization',
    price: 150,
    category: 'themes'
  },
  {
    itemId: uuidv4(),
    name: 'Animated Avatar',
    description: 'Use animated GIF as avatar',
    price: 400,
    category: 'avatar'
  }
];

async function initializeDatabase() {
  try {
    
    await ShopItem.deleteMany({});
    console.log('Cleared existing shop items');

    
    await ShopItem.insertMany(defaultItems);
    console.log(`✅ Successfully added ${defaultItems.length} shop items to database`);

    
    const items = await ShopItem.find();
    console.log('\n📦 Shop Items:');
    items.forEach(item => {
      console.log(`  - ${item.name}: ${item.price} coins`);
    });

    mongoose.connection.close();
    console.log('\n✨ Database initialization complete!');
  } catch (error) {
    console.error('❌ Error initializing database:', error.message);
    mongoose.connection.close();
    process.exit(1);
  }
}

console.log('🚀 Initializing Discord-Like App Database...');
initializeDatabase();
