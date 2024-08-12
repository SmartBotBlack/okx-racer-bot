# Okx Racer Telegram Game Bot

This repository contains scripts for automating the Okx Racer game on Telegram. The scripts are developed by the SmartBot Team.

The script does:
- Collect daily bonus.
- Infinitely win bets with the margin of error you need. By default 90% of bets are won.

## Table of Contents
- [Installation](#installation)
- [Usage](#usage)
- [Contributing](#contributing)
- [License](#license)

## Installation

To get started with the Okx Racer Telegram Game Bot, follow these steps:

1. Install [NodeJS](https://nodejs.org/en)
2. `git clone https://github.com/SmartBotBlack/okx-racer-bot.git`
3. `cd okx-racer-bot`
4. `npm i`

## Usage

After installing the scripts, follow these steps to start using the bot:

1. Open Okx Game in Telegram Web.
2. Open DevTools and copy url from OKX iframe. Ex: `https://www.okx.com/mini-app/racer#tgWebAppData=query_id%3DA...`
3. Paste url in `data.txt` file. For every new account from new line.
4. Run `npx tsx ./src/index.ts`

## Contributing

We welcome contributions to improve the kx Racer Telegram Game Bot. If you have any suggestions or encounter any issues, please open an issue or submit a pull request.

1. Fork the repository.
2. Create a new branch (`git checkout -b feature-branch`).
3. Make your changes.
4. Commit your changes (`git commit -m 'Add new feature'`).
5. Push to the branch (`git push origin feature-branch`).
6. Open a pull request.

## Disclaimer

This script is provided by the SmartBot Team and is intended for educational and personal use only. Use it at your own risk.

---

For more information, visit [@monomycrypto](https://t.me/monomycrypto)
