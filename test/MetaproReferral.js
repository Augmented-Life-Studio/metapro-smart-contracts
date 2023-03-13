const {expect} = require('chai')
const {BigNumber} = require('ethers')
const {ethers} = require('hardhat')
const _ = require('lodash')

// test command => npx hardhat test test/MetaproReferral.js

describe('MetaproReferral', () => {
	let metaproReferral
	let deployer
	let accounts
	let transaction
	beforeEach(async () => {
		const [contractDeployer, ...restAccounts] = await ethers.getSigners()
		accounts = restAccounts
		deployer = contractDeployer
		const MetaproReferral = await ethers.getContractFactory(
			'contracts/MetaproReferral.sol:MetaproReferral',
			deployer,
		)
		metaproReferral = await MetaproReferral.deploy()

		transaction = await metaproReferral.setAdminStatus(deployer.address, true)
		await transaction.wait()
		transaction = await metaproReferral.isAdmin(deployer.address)
	})

	describe('Deployment', () => {
		it('Get current owner and admin', async () => {
			const currentOwner = await metaproReferral.owner()
			expect(currentOwner).to.equal(deployer.address)
			transaction = await metaproReferral.isAdmin(deployer.address)
			expect(transaction).to.equal(true)
		})
	})

	describe('Setting referrals', () => {
		it('Should correctly set my referral', async () => {
			transaction = await metaproReferral
				.connect(deployer)
				.setMyReferral(accounts[0].address)
			await transaction.wait()
			refStructure = await metaproReferral.getReferralStructure(
				accounts[0].address,
			)
			expect(refStructure[0]).to.equal(deployer.address)
		})

		it('Should correctly set my referrals', async () => {
			transaction = await metaproReferral
				.connect(deployer)
				.setMyReferrals(accounts.map(el => el.address))
			await transaction.wait()
			const allUplinesPromises = accounts.map(async el => {
				const refStruct = await metaproReferral.getReferralStructure(el.address)
				return refStruct[0]
			})

			const allUplines = await Promise.all(allUplinesPromises)
			expect(allUplines.every(addr => addr === deployer.address)).to.be.true
		})
	})

	describe('Saving referral deposit', () => {
		it('Should correctly set my referrals with all needed transaction data', async () => {
			const referrer = accounts[0].address
			const contractAddress = accounts[1].address
			const auctionId = 1
			const tokenId = 1
			const depositer = accounts[2].address
			const level = 1
			const provision = 100
			transaction = await metaproReferral
				.connect(deployer)
				.saveReferralDeposit(
					referrer,
					contractAddress,
					auctionId,
					tokenId,
					depositer,
					level,
					provision,
				)

			await transaction.wait()

			const refDeposits = await metaproReferral
				.connect(deployer)
				.getReferralDeposits(accounts[0].address)

			const [_, level1] = await metaproReferral.getReferralStructure(referrer)
			expect(level1[0]).to.equal(depositer)
			const [contrAddress, aucId, tokId, depos, lev, prov] = refDeposits[0]
			expect(contrAddress).to.equal(contractAddress)
			expect(aucId).to.equal(auctionId)
			expect(tokId).to.equal(tokenId)
			expect(depos).to.equal(depositer)
			expect(lev).to.equal(level)
			expect(prov).to.equal(provision)
			const lol = await metaproReferral.getReferralContractEearnings(
				referrer,
				contractAddress,
			)
			const [all, level1Earnings] =
				await metaproReferral.getReferralContractEearnings(
					referrer,
					contractAddress,
				)
			expect(all).to.equal(BigNumber.from(100))
			expect(level1Earnings).to.equal(BigNumber.from(100))
		})
	})

	describe('Saving referral structure as an owner', () => {
		it('Get proper structure', async () => {
			transaction = await metaproReferral
				.connect(deployer)
				.setReferralStructure(
					accounts[0].address,
					accounts[1].address,
					[accounts[2].address, accounts[3].address, accounts[4].address],
					[accounts[5].address, accounts[6].address, accounts[7].address],
					[accounts[8].address, accounts[9].address, accounts[10].address],
				)

			await transaction.wait()

			// Check if already assigned level3 referred will be skiped
			transaction = await metaproReferral
				.connect(deployer)
				.setReferralStructure(
					accounts[0].address,
					accounts[1].address,
					[],
					[],
					[accounts[8].address],
				)

			await transaction.wait()
			const [upline, level1, level2, level3] =
				await metaproReferral.getReferralStructure(accounts[0].address)
			expect(upline).to.equal(accounts[1].address)
			expect(
				_.isEqual(level1, [
					accounts[2].address,
					accounts[3].address,
					accounts[4].address,
				]),
			).to.true
			expect(
				_.isEqual(level2, [
					accounts[5].address,
					accounts[6].address,
					accounts[7].address,
				]),
			).to.true
			expect(
				_.isEqual(level3, [
					accounts[8].address,
					accounts[9].address,
					accounts[10].address,
				]),
			).to.true
		})
	})
})
