require('@nomiclabs/hardhat-waffle')
require('hardhat-gas-reporter')
require('solidity-coverage')

module.exports = {
	gasReporter: {
		currency: 'USD',
		token: 'BNB',
		gasPriceApi: 'https://api.bscscan.com/api?module=proxy&action=eth_gasPrice',
		gasPrice: 5,
		coinmarketcap: '48fdecb5-5c9f-4424-8f58-c985679e3b90',
		enabled: process.env.GAS_REPORT ? true : false,
		// enabled: true,
	},
	networks: {
		testnet: {
			url: 'https://bsc-testnet.public.blastapi.io',
			chainId: 97,
			gasPrice: 20000000000,
		},
		mainnet: {
			url: 'https://bsc-dataseed.binance.org/',
			chainId: 56,
			gasPrice: 20000000000,
		},
		ganache: {
			url: 'http://127.0.0.1:8545',
		},
		coverage: {
			url: 'http://localhost:8555',
		},
	},
	solidity: {
		version: '0.8.3',
		settings: {
			optimizer: {
				enabled: true,
				runs: 200,
			},
		},
	},
	coverage: {
		collectCoverage: true,
		coverageProvider: 'solidity',
		outputDir: 'coverage',
		ignoreGlobalTruffleArtifacts: true,
	},
	paths: {
		sources: './contracts',
		tests: './test/MetaproBuyNow.js',
		cache: './cache',
		artifacts: './artifacts',
	},
}
