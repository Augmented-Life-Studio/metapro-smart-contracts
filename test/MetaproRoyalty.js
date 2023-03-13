const {expect} = require('chai')
const {BigNumber} = require('ethers')
const {ethers} = require('hardhat')

// test command => npx hardhat test test/MetaproRoyalty.js

describe('MetaproRoyalty', () => {
	let metaproRoyalty, metaproMetaAsset, metaAssetPlain
	let mainAccount
	let accounts
	before(async () => {
		const allAccounts = await ethers.getSigners()
		mainAccount = allAccounts[0]
		standaloneAccount = allAccounts[1]
		accounts = allAccounts.slice(2)
		const MetaproMetaAsset = await ethers.getContractFactory(
			'contracts/MetaproMetaAsset.sol:MetaproMetaAsset',
		)
		metaproMetaAsset = await MetaproMetaAsset.deploy(
			'uriPath.com',
			accounts[0].address,
		)

		const MetaAssetPlain = await ethers.getContractFactory(
			'contracts/mocks/MetaAssetPlain.sol:MetaAssetPlain',
		)
		metaAssetPlain = await MetaAssetPlain.deploy(
			'uriPath.com',
			accounts[0].address,
		)

		transaction = await metaproMetaAsset
			.connect(mainAccount)
			.create(mainAccount.address, 1000, 'bucketHash', 0x00)

		await transaction.wait()

		transaction = await metaAssetPlain
			.connect(mainAccount)
			.create(mainAccount.address, 1000, 'bucketHash', 0x00)

		await transaction.wait()

		const MetaproRoyalty = await ethers.getContractFactory(
			'contracts/MetaproRoyalty.sol:MetaproRoyalty',
		)
		metaproRoyalty = await MetaproRoyalty.deploy()
	})

	describe('Deployment', () => {
		it('Suppose to show initial currentTeamId', async () => {
			expect(await metaproRoyalty.currentTeamId()).to.equal(1)
		})
	})

	describe('Create team', () => {
		it('Executes createTeam properly on proper contract', async () => {
			const transaction = await metaproRoyalty
				.connect(mainAccount)
				.createTeam(
					1001,
					metaproMetaAsset.address,
					[standaloneAccount.address],
					[10],
				)
			await transaction.wait()
			const [_, tokenId] = await metaproRoyalty.getTeam(
				1001,
				metaproMetaAsset.address,
			)
			expect(tokenId).to.equal(BigNumber.from(1001))
			const teamMembers = await metaproRoyalty.getTeamMembers(
				tokenId,
				metaproMetaAsset.address,
			)
			expect(teamMembers.lenght).to.equal(accounts.lenght)
		})
		it('Executes createTeam wrong on plain contract', async () => {
			try {
				const transaction = await metaproRoyalty
					.connect(mainAccount)
					.createTeam(
						1001,
						metaAssetPlain.address,
						[standaloneAccount.address],
						[10],
					)
				await transaction.wait()
			} catch (error) {
				expect(error).to.not.be.empty
			}
		})
	})

	describe('Change team members function', () => {
		it('Executes createTeam and than change it properly', async () => {
			transaction = await metaproRoyalty
				.connect(mainAccount)
				.changeTeamMembersAndRoyalty(
					1001,
					metaproMetaAsset.address,
					accounts.map(el => el.address),
					accounts.map(_ => 12),
				)

			await transaction.wait()
			const newMembers = await metaproRoyalty.getTeamMembers(
				1001,
				metaproMetaAsset.address,
			)
			expect(newMembers.length).to.equal(accounts.length)
			transaction = await metaproRoyalty
				.connect(mainAccount)
				.changeTeamMembersAndRoyalty(
					1001,
					metaproMetaAsset.address,
					accounts.map(el => el.address),
					accounts.map(_ => 12),
				)
			await transaction.wait()
			const newMembers2 = await metaproRoyalty.getTeamMembers(
				1001,
				metaproMetaAsset.address,
			)
			expect(newMembers2.length).to.equal(accounts.length)
		})
	})
})
