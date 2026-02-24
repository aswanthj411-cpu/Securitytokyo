const { Client, GatewayIntentBits, Partials } = require('discord.js');
const fs = require('fs');

// --------------------------- CONFIG ---------------------------
const TOKEN = process.env.TOKEN; // set in Railway env variables
const LOG_CHANNEL_IDS = ["1475805554726273034", "1467878373119365347"]; // log channels
const OWNERS = ["1405447087423885312"]; // trusted admins

const BAD_WORDS = ["punda", "sunni", "thevudiya", "gommala"];
const MESSAGE_REPEAT_LIMIT = 5;
const MESSAGE_REPEAT_TIME = 15 * 1000; // 15 sec
const CHANNEL_SPAM_LIMIT = 5;
const CHANNEL_SPAM_TIME = 10 * 1000; // 10 sec
const TIMEOUT_DURATION = 10 * 60 * 1000; // 10 min

// --------------------------- CLIENT ---------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// --------------------------- CACHE ---------------------------
let cache = JSON.parse(fs.readFileSync("cache.json", "utf8"));
function saveCache(){ fs.writeFileSync("cache.json", JSON.stringify(cache, null, 2)); }

// --------------------------- READY ---------------------------
client.once("ready", () => {
  console.log(`✅ Bot Online as ${client.user.tag}`);
});

// --------------------------- MESSAGE EVENT ---------------------------
client.on("messageCreate", async message => {
  if(message.author.bot || !message.guild || !message.member) return;
  const content = message.content.toLowerCase();
  
  // Helper: log to all channels
  function log(msg){
    LOG_CHANNEL_IDS.forEach(id=>{
      const ch = message.guild.channels.cache.get(id);
      if(ch) ch.send(msg);
    });
  }

  const userId = message.author.id;
  const now = Date.now();

  // 1️⃣ Bad words
  if(BAD_WORDS.some(word => content.includes(word))){
    await message.member.timeout(TIMEOUT_DURATION, "Used bad word").catch(()=>{});
    log(`⛔ ${message.member.user.tag} timed out for bad word: "${message.content}"`);
    return;
  }

  // 2️⃣ Repeated message spam
  if(!cache.messageCache[userId]) cache.messageCache[userId]=[];
  cache.messageCache[userId].push({content, time: now});
  cache.messageCache[userId] = cache.messageCache[userId].filter(msg => now - msg.time <= MESSAGE_REPEAT_TIME);
  if(cache.messageCache[userId].filter(msg => msg.content===content).length>=MESSAGE_REPEAT_LIMIT){
    await message.member.timeout(TIMEOUT_DURATION, "Repeated spam").catch(()=>{});
    log(`⛔ ${message.member.user.tag} timed out for repeated spam: "${content}"`);
    cache.messageCache[userId] = [];
    saveCache();
    return;
  }

  // 3️⃣ Link detection
  const linkRegex = /(https?:\/\/[^\s]+)/gi;
  if(linkRegex.test(content)){
    await message.member.timeout(TIMEOUT_DURATION, "Sent a link").catch(()=>{});
    log(`⛔ ${message.member.user.tag} timed out for sending link: "${message.content}"`);
    return;
  }

  saveCache();
});

// --------------------------- CHANNEL CREATION EVENT ---------------------------
client.on("channelCreate", async channel=>{
  const guildId = channel.guild.id;
  const logMsg = (msg)=>LOG_CHANNEL_IDS.forEach(id=>{
    const ch = channel.guild.channels.cache.get(id);
    if(ch) ch.send(msg);
  });

  const audit = await channel.guild.fetchAuditLogs({type:12, limit:1}).catch(()=>null);
  const entry = audit?.entries.first();
  const creator = entry?.executor;
  if(!creator) return;

  if(!cache.channelCreationCache[guildId]) cache.channelCreationCache[guildId] = [];
  cache.channelCreationCache[guildId].push({time: Date.now(), creator: creator.id});
  cache.channelCreationCache[guildId] = cache.channelCreationCache[guildId].filter(c=>Date.now()-c.time<=CHANNEL_SPAM_TIME);

  const userChannels = cache.channelCreationCache[guildId].filter(c=>c.creator===creator.id);
  if(userChannels.length>=CHANNEL_SPAM_LIMIT){
    const member = channel.guild.members.cache.get(creator.id);
    if(member && !OWNERS.includes(member.id)){
      await member.ban({reason:"Channel spam"}).catch(()=>{});
      log(`🚨 ${member.user.tag} banned for channel spam`);
      cache.channelCreationCache[guildId] = cache.channelCreationCache[guildId].filter(c=>c.creator!==creator.id);
    }
  }
  saveCache();
});

// --------------------------- BOT PROTECTION ---------------------------
client.on("guildMemberAdd", async member=>{
  if(member.user.bot && !OWNERS.includes(member.user.id)){
    await member.ban({reason:"Unauthorized bot"}).catch(()=>{});
    LOG_CHANNEL_IDS.forEach(id=>{
      const ch = member.guild.channels.cache.get(id);
      if(ch) ch.send(`🚨 Unauthorized bot ${member.user.tag} banned automatically`);
    });
  }
});

// --------------------------- LOGIN ---------------------------
client.login(TOKEN);
