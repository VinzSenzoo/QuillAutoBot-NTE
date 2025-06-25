import "dotenv/config";
import blessed from "blessed";
import figlet from "figlet";
import { ethers } from "ethers";
import axios from "axios";

const RPC_URL = process.env.RPC_URL_SOMNIA_TESTNET;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const FUN_CONTRACT_ADDRESS = "0x16f2fec3bf691e1516b186f51e0daa5114c9b5e8";
const NETWORK_NAME = "Somnia Testnet";
const DEBUG_MODE = false;

const FUN_ABI = [
  "function addFun(string message) payable",
  "function paused() view returns (bool)",
  "function funFee() view returns (uint256)"
];

const funMessages = [
  "hallo",
  "gm",
  "Have a great day!",
  "Sending some fun your way!",
  "Keep smiling!",
  "You're awesome!",
  "Stay positive!",
  "Make today amazing!",
  "Believe in yourself!",
  "You got this!"
];

const FUN_FEE = 0.1;

const globalHeaders = {
  'accept': '*/*',
  'accept-encoding': 'gzip, deflate, br, zstd',
  'accept-language': 'en-US,en;q=0.9,id;q=0.8',
  'content-type': 'application/json',
  'origin': 'https://quills.fun',
  'priority': 'u=1, i',
  'referer': 'https://quills.fun/',
  'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
};

let walletInfo = {
  address: "",
  balanceStt: "0.00",
  network: NETWORK_NAME,
  status: "Initializing"
};

let transactionLogs = [];
let swapRunning = false;
let swapCancelled = false;
let globalWallet = null;
let provider = null;
let authToken = null;

function getShortAddress(address) {
  return address ? address.slice(0, 6) + "..." + address.slice(-4) : "N/A";
}

function addLog(message, type) {
  if (type === "debug" && !DEBUG_MODE) return;
  const timestamp = new Date().toLocaleTimeString();
  let coloredMessage = message;
  if (type === "system") coloredMessage = `{bright-white-fg}${message}{/bright-white-fg}`;
  else if (type === "error") coloredMessage = `{bright-red-fg}${message}{/bright-red-fg}`;
  else if (type === "success") coloredMessage = `{bright-green-fg}${message}{/bright-green-fg}`;
  else if (type === "warning") coloredMessage = `{bright-yellow-fg}${message}{/bright-yellow-fg}`;
  else if (type === "debug") coloredMessage = `{bright-magenta-fg}${message}{/bright-magenta-fg}`;

  transactionLogs.push(`{bright-cyan-fg}[{/bright-cyan-fg} {bold}{grey-fg}${timestamp}{/grey-fg}{/bold} {bright-cyan-fg}]{/bright-cyan-fg} {bold}${coloredMessage}{/bold}`);
  updateLogs();
}

function getRandomDelay() {
  return Math.random() * (60000 - 30000) + 30000;
}

function updateLogs() {
  logsBox.setContent(transactionLogs.join("\n"));
  logsBox.setScrollPerc(100);
  safeRender();
}

function clearTransactionLogs() {
  transactionLogs = [];
  logsBox.setContent("");
  logsBox.setScroll(0);
  updateLogs();
  safeRender();
  addLog("Transaction logs telah dihapus.", "system");
}

async function updateWalletData() {
  try {
    provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    globalWallet = wallet;
    walletInfo.address = wallet.address;

    const sttBalance = await provider.getBalance(wallet.address);
    walletInfo.balanceStt = ethers.formatEther(sttBalance);

    updateWallet();
    addLog("Informasi Wallet Diperbarui!", "system");
  } catch (error) {
    addLog("Gagal mengambil data wallet: " + error.message, "error");
  }
}

function updateWallet() {
  const shortAddress = walletInfo.address ? getShortAddress(walletInfo.address) : "N/A";
  const stt = walletInfo.balanceStt ? Number(walletInfo.balanceStt).toFixed(4) : "0.0000";

  const content = `┌── Address   : {bright-yellow-fg}${shortAddress}{/bright-yellow-fg}
│   ├── STT       : {bright-green-fg}${stt}{/bright-green-fg}
└── Network       : {bright-cyan-fg}${NETWORK_NAME}{/bright-cyan-fg}`;
  walletBox.setContent(content);
  safeRender();
}

async function loginWallet() {
  try {
    const nonce = Date.now().toString();
    const message = `I accept the Quills Adventure Terms of Service at https://quills.fun/terms\n\nNonce: ${nonce}`;
    const signature = await globalWallet.signMessage(message);

    const payload = {
      address: walletInfo.address,
      signature,
      message
    };

    const response = await axios.post('https://quills.fun/api/auth/wallet', payload, {
      headers: globalHeaders
    });

    if (response.data.success) {
      addLog("Login wallet berhasil!", "success");
      const setCookie = response.headers['set-cookie'];
      if (setCookie) {
        const cookie = setCookie[0];
        const tokenMatch = cookie.match(/auth_token=([^;]+)/);
        if (tokenMatch) {
          authToken = tokenMatch[1];
          addLog("Auth token berhasil disimpan.", "system");
        } else {
          addLog("Gagal mengekstrak auth token dari cookie.", "error");
          return false;
        }
      } else {
        addLog("Tidak ada set-cookie dalam respons login.", "error");
        return false;
      }

      return await verifyWallet();
    } else {
      addLog("Login wallet gagal: " + response.data.message, "error");
      return false;
    }
  } catch (error) {
    addLog("Gagal melakukan login wallet: " + error.message, "error");
    return false;
  }
}

async function verifyWallet() {
  try {
    const response = await axios.get('https://quills.fun/api/verify-wallet', {
      headers: {
        ...globalHeaders,
        cookie: `auth_token=${authToken}`
      }
    });

    if (response.data.success) {
      return true;
    } else {
      addLog("Verifikasi wallet gagal: " + response.data.message, "error");
      return false;
    }
  } catch (error) {
    addLog("Gagal memverifikasi wallet: " + error.message, "error");
    return false;
  }
}

async function mintNFT(message) {
  try {
    const payload = {
      walletAddress: walletInfo.address,
      message
    };

    const response = await axios.post('https://quills.fun/api/mint-nft', payload, {
      headers: {
        ...globalHeaders,
        cookie: `auth_token=${authToken}`
      }
    });

    if (response.data.success) {
      addLog(`Mint NFT berhasil untuk pesan: "${message}"`, "success");
      return true;
    } else {
      addLog("Mint NFT gagal: " + response.data.message, "error");
      return false;
    }
  } catch (error) {
    addLog("Gagal melakukan mint NFT: " + error.message, "error");
    return false;
  }
}

async function executeSwapWithNonceRetry(txFn, returnTx = false, maxRetries = 3) {
  for (let retry = 0; retry < maxRetries; retry++) {
    try {
      let nonce = await provider.getTransactionCount(globalWallet.address, "pending");
      const tx = await txFn(nonce);
      if (returnTx) return tx;
      const receipt = await tx.wait();
      if (receipt.status === 1) {
        return receipt;
      } else {
        throw new Error("Transaksi reverted");
      }
    } catch (error) {
      if (error.message.includes("nonce too low") || error.message.includes("nonce has already been used") || error.message.includes("reverted")) {
        addLog(`Transaksi gagal (percobaan ${retry + 1}): ${error.message}. Mengambil nonce terbaru...`, "warning");
        if (retry === maxRetries - 1) {
          throw new Error(`Gagal setelah ${maxRetries} percobaan: ${error.message}`);
        }
        continue;
      } else {
        throw error;
      }
    }
  }
}

async function autoSendFun() {
  try {
    const contract = new ethers.Contract(FUN_CONTRACT_ADDRESS, FUN_ABI, globalWallet);

    const isPaused = await contract.paused();
    if (isPaused) {
      addLog("Kontrak Quil Fun sedang dalam status paused. Tidak dapat melakukan send fun.", "error");
      return false;
    }

    const contractFunFee = await contract.funFee();
    const contractFunFeeInEther = ethers.formatEther(contractFunFee);
    const sttAmount = FUN_FEE;
    const amountInWei = ethers.parseEther(sttAmount.toString());

    if (parseFloat(contractFunFeeInEther) > sttAmount) {
      addLog(`Biaya kontrak ${contractFunFeeInEther} STT lebih tinggi dari FUN_FEE ${sttAmount} STT.`, "error");
      return false;
    }

    const sttBalance = parseFloat(walletInfo.balanceStt);
    if (sttBalance < sttAmount) {
      addLog(`Saldo STT tidak cukup: ${sttBalance} < ${sttAmount}`, "warning");
      return false;
    }

    const message = funMessages[Math.floor(Math.random() * funMessages.length)];
    addLog(`Melakukan send fun: "${message}" dengan ${sttAmount} STT`, "system");

    let gasLimit;
    try {
      const estimatedGas = await contract.estimateGas.addFun(message, { value: amountInWei });
      gasLimit = estimatedGas.mul(120).div(100);
      addLog(`Estimasi gas: ${estimatedGas.toString()}, gas limit dengan buffer: ${gasLimit.toString()}`, "system");
    } catch (error) {
      gasLimit = 2000000;
    }

    const receipt = await executeSwapWithNonceRetry(async (nonce) => {
      return await contract.addFun(message, { value: amountInWei, gasLimit, nonce });
    });

    if (receipt.status === 1) {
      addLog(`Send Fun Berhasil. Hash: ${receipt.hash}`, "success");
      await mintNFT(message);
      return true;
    } else {
      addLog("Send Fun Gagal: Transaksi reverted", "error");
      return false;
    }
  } catch (error) {
    addLog(`Gagal melakukan send fun: ${error.message}`, "error");
    return false;
  }
}

async function runAutoSendFun() {
  promptBox.setFront();
  promptBox.readInput("Masukkan jumlah kali auto send fun", "", async (err, value) => {
    promptBox.hide();
    safeRender();
    if (err || !value) {
      addLog("Auto Send Fun: Input tidak valid atau dibatalkan.", "system");
      return;
    }
    const loopCount = parseInt(value);
    if (isNaN(loopCount)) {
      addLog("Auto Send Fun: Input harus berupa angka.", "system");
      return;
    }
    addLog(`Auto Send Fun: Mulai ${loopCount} iterasi send fun.`, "system");

    swapRunning = true;
    swapCancelled = false;
    mainMenu.setItems(getMainMenuItems());
    quilFunSubMenu.setItems(getQuilFunMenuItems());
    quilFunSubMenu.show();
    safeRender();

    for (let i = 1; i <= loopCount; i++) {
      if (swapCancelled) {
        addLog(`Auto Send Fun: Dihentikan pada Cycle ${i}.`, "system");
        break;
      }
      addLog(`Memulai send fun ke-${i}`, "system");
      const success = await autoSendFun();
      if (success) {
        await updateWalletData();
      }
      if (i < loopCount && !swapCancelled) {
        const delayTime = getRandomDelay();
        const minutes = Math.floor(delayTime / 60000);
        const seconds = Math.floor((delayTime % 60000) / 1000);
        addLog(`Send fun ke-${i} Selesai. Menunggu ${minutes} menit ${seconds} detik.`, "system");
        const startTime = Date.now();
        while (Date.now() - startTime < delayTime) {
          if (swapCancelled) {
            addLog("Auto Send Fun: Dihentikan saat periode tunggu.", "system");
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        if (swapCancelled) break;
      }
    }
    swapRunning = false;
    swapCancelled = false;
    mainMenu.setItems(getMainMenuItems());
    quilFunSubMenu.setItems(getQuilFunMenuItems());
    safeRender();
    addLog("Auto Send Fun: Selesai.", "system");
  });
}

const screen = blessed.screen({
  smartCSR: true,
  title: "Quil Fun",
  fullUnicode: true,
  mouse: true
});

let renderTimeout;

function safeRender() {
  if (renderTimeout) clearTimeout(renderTimeout);
  renderTimeout = setTimeout(() => { screen.render(); }, 50);
}

const headerBox = blessed.box({
  top: 0,
  left: "center",
  width: "100%",
  tags: true,
  style: { fg: "white", bg: "default" }
});

figlet.text("NT EXHAUST".toUpperCase(), { font: "ANSI Shadow" }, (err, data) => {
  if (err) headerBox.setContent("{center}{bold}NT Exhaust{/bold}{/center}");
  else headerBox.setContent(`{center}{bold}{bright-cyan-fg}${data}{/bright-cyan-fg}{/bold}{/center}`);
  safeRender();
});

const descriptionBox = blessed.box({
  left: "center",
  width: "100%",
  content: "{center}{bold}{bright-yellow-fg}✦ ✦ QUIL FUN AUTO SEND ✦ ✦{/bright-yellow-fg}{/bold}{/center}",
  tags: true,
  style: { fg: "white", bg: "default" }
});

const logsBox = blessed.box({
  label: " Transaction Logs ",
  left: 0,
  border: { type: "line" },
  scrollable: true,
  alwaysScroll: true,
  mouse: true,
  keys: true,
  vi: true,
  tags: true,
  style: { border: { fg: "red" }, fg: "white" },
  scrollbar: { ch: " ", inverse: true, style: { bg: "blue" } },
  content: ""
});

const walletBox = blessed.box({
  label: " Informasi Wallet ",
  border: { type: "line" },
  tags: true,
  style: { border: { fg: "magenta" }, fg: "white", bg: "default" },
  content: "Memuat data wallet..."
});

const mainMenu = blessed.list({
  label: " Menu ",
  left: "60%",
  keys: true,
  vi: true,
  mouse: true,
  border: { type: "line" },
  style: { fg: "white", bg: "default", border: { fg: "red" }, selected: { bg: "green", fg: "black" } },
  items: getMainMenuItems()
});

function getMainMenuItems() {
  let items = [];
  if (swapRunning) items.push("Stop Transaction");
  items = items.concat(["Quil Fun", "Clear Transaction Logs", "Refresh", "Exit"]);
  return items;
}

function getQuilFunMenuItems() {
  let items = [];
  if (swapRunning) items.push("Stop Transaction");
  items = items.concat([
    "Auto Send Fun",
    "Clear Transaction Logs",
    "Back To Main Menu",
    "Refresh"
  ]);
  return items;
}

const quilFunSubMenu = blessed.list({
  label: " Quil Fun Sub Menu ",
  left: "60%",
  keys: true,
  vi: true,
  mouse: true,
  tags: true,
  border: { type: "line" },
  style: { fg: "white", bg: "default", border: { fg: "red" }, selected: { bg: "cyan", fg: "black" } },
  items: getQuilFunMenuItems()
});
quilFunSubMenu.hide();

const promptBox = blessed.prompt({
  parent: screen,
  border: "line",
  height: 5,
  width: "60%",
  top: "center",
  left: "center",
  label: "{bright-blue-fg}Prompt{/bright-blue-fg}",
  tags: true,
  keys: true,
  vi: true,
  mouse: true,
  style: { fg: "bright-red", bg: "default", border: { fg: "red" } }
});

screen.append(headerBox);
screen.append(descriptionBox);
screen.append(logsBox);
screen.append(walletBox);
screen.append(mainMenu);
screen.append(quilFunSubMenu);

function adjustLayout() {
  const screenHeight = screen.height;
  const screenWidth = screen.width;
  const headerHeight = Math.max(8, Math.floor(screenHeight * 0.15));
  headerBox.top = 0;
  headerBox.height = headerHeight;
  headerBox.width = "100%";
  descriptionBox.top = "23%";
  descriptionBox.height = Math.floor(screenHeight * 0.05);
  logsBox.top = headerHeight + descriptionBox.height;
  logsBox.left = 0;
  logsBox.width = Math.floor(screenWidth * 0.6);
  logsBox.height = screenHeight - (headerHeight + descriptionBox.height);
  walletBox.top = headerHeight + descriptionBox.height;
  walletBox.left = Math.floor(screenWidth * 0.6);
  walletBox.width = Math.floor(screenWidth * 0.4);
  walletBox.height = Math.floor(screenHeight * 0.35);
  mainMenu.top = headerHeight + descriptionBox.height + walletBox.height;
  mainMenu.left = Math.floor(screenWidth * 0.6);
  mainMenu.width = Math.floor(screenWidth * 0.4);
  mainMenu.height = screenHeight - (headerHeight + descriptionBox.height + walletBox.height);
  quilFunSubMenu.top = mainMenu.top;
  quilFunSubMenu.left = mainMenu.left;
  quilFunSubMenu.width = mainMenu.width;
  quilFunSubMenu.height = mainMenu.height;
  safeRender();
}

screen.on("resize", adjustLayout);
adjustLayout();

mainMenu.on("select", (item) => {
  const selected = item.getText();
  if (selected === "Quil Fun") {
    quilFunSubMenu.show();
    quilFunSubMenu.focus();
    safeRender();
  } else if (selected === "Stop Transaction") {
    if (swapRunning) {
      swapCancelled = true;
      addLog("Stop Transaction: Transaksi akan dihentikan.", "system");
    }
  } else if (selected === "Clear Transaction Logs") {
    clearTransactionLogs();
  } else if (selected === "Refresh") {
    updateWalletData();
    safeRender();
    addLog("Refreshed", "system");
  } else if (selected === "Exit") {
    process.exit(0);
  }
});

quilFunSubMenu.on("select", (item) => {
  const selected = item.getText();
  if (selected === "Auto Send Fun") {
    if (swapRunning) {
      addLog("Transaksi sedang berjalan. Hentikan transaksi terlebih dahulu.", "warning");
    } else {
      runAutoSendFun();
    }
  } else if (selected === "Stop Transaction") {
    if (swapRunning) {
      swapCancelled = true;
      addLog("Quil Fun: Perintah Stop Transaction diterima.", "system");
    } else {
      addLog("Quil Fun: Tidak ada transaksi yang berjalan.", "system");
    }
  } else if (selected === "Clear Transaction Logs") {
    clearTransactionLogs();
  } else if (selected === "Back To Main Menu") {
    quilFunSubMenu.hide();
    mainMenu.show();
    mainMenu.focus();
    safeRender();
  } else if (selected === "Refresh") {
    updateWalletData();
    safeRender();
    addLog("Refreshed", "system");
  }
});

screen.key(["escape", "q", "C-c"], () => process.exit(0));
screen.key(["C-up"], () => { logsBox.scroll(-1); safeRender(); });
screen.key(["C-down"], () => { logsBox.scroll(1); safeRender(); });

async function initialize() {
  await updateWalletData();
  const loginSuccess = await loginWallet();
  if (!loginSuccess) {
    addLog("Gagal menginisialisasi bot karena login gagal.", "error");
    process.exit(1);
  }
  safeRender();
  mainMenu.focus();
  addLog("Dont Forget To Subscribe YT And Telegram @NTExhaust!!", "system");
}

initialize();
