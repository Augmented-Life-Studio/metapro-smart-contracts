const {expect} = require('chai')
const {BigNumber} = require('ethers')
const {ethers} = require('hardhat')
const _ = require('lodash')

// test command => npx hardhat test test/MetaproBuyNow.js

describe('MetaproBuyNow', () => {
	const royaltyFee = 300 // 300 = 3%
	let metaproMetaAsset
	let busd
	let metaproReferral
	let metaproRoyalty
	let metaproBuy

	let deployer
	let treasury
	let uplineReferrer
	let level1referrer
	let level2referrer
	let level3referrer
	let royaltyMember1
	let royaltyMember2
	let royaltyMember3
	let accounts
	let transaction
	let currentBlockNumber
	let multipleDepositsAuctionId
	let singleDepositAuctionId
	before(async () => {
		const allSigners = await ethers.getSigners()
		const [
			contractDeployer,
			contractTreasury,
			contractRoyaltyMember1,
			contractRoyaltyMember2,
			contractRoyaltyMember3,
			...restAccounts
		] = allSigners
		const [
			uplineContractReferrer,
			level1contractReferrer,
			level2contractReferrer,
			level3contractReferrer,
		] = restAccounts

		treasury = contractTreasury
		deployer = contractDeployer
		uplineReferrer = uplineContractReferrer
		level1referrer = level1contractReferrer
		level2referrer = level2contractReferrer
		level3referrer = level3contractReferrer

		royaltyMember1 = contractRoyaltyMember1
		royaltyMember2 = contractRoyaltyMember2
		royaltyMember3 = contractRoyaltyMember3

		accounts = restAccounts

		//Create mocked BUSD contract
		const BusdToken = await ethers.getContractFactory('BUSDToken')
		transaction = await ethers.provider._getBlock()
		currentBlockNumber = transaction.number
		busd = await BusdToken.deploy(restAccounts.map(el => el.address))
		transaction = await busd.balanceOf(deployer.address)
		expect(BigNumber.from(transaction).gt(BigNumber.from(0))).to.be.true

		//Create MetaproMetaAsset contract
		const MetaproMetaAsset = await ethers.getContractFactory(
			'contracts/MetaproMetaAsset.sol:MetaproMetaAsset',
		)
		metaproMetaAsset = await MetaproMetaAsset.deploy(
			'metaproUri',
			treasury.address,
		)
		// Create MetaproReferral contract
		const MetaproReferral = await ethers.getContractFactory(
			'contracts/MetaproReferral.sol:MetaproReferral',
		)
		metaproReferral = await MetaproReferral.deploy()

		// Create MetaproReferral contract
		const MetaproRoyalty = await ethers.getContractFactory(
			'contracts/MetaproRoyalty.sol:MetaproRoyalty',
		)
		metaproRoyalty = await MetaproRoyalty.deploy()
		// Create MetaproINS contract with busd
		const MetaproBuyNow = await ethers.getContractFactory('MetaproBuyNow')
		metaproBuy = await MetaproBuyNow.deploy(
			busd.address,
			treasury.address,
			metaproReferral.address,
			metaproRoyalty.address,
		)
		// Approve INS creator for spending busd
		transaction = await busd
			.connect(deployer)
			.approve(metaproBuy.address, ethers.utils.parseUnits('99999999', 18))
		await transaction.wait()

		// Approve all depositers for spending busd
		const allDepositers = [
			uplineReferrer,
			level1referrer,
			level2referrer,
			level3referrer,
		]
		await Promise.all(
			allDepositers.map(async el => {
				transaction = await busd
					.connect(el)
					.approve(metaproBuy.address, ethers.utils.parseUnits('99999999', 18))
				await transaction.wait()
			}),
		)

		// Check deployment of the MetaproMetaAsset
		expect(await metaproMetaAsset.treasuryAddress()).to.equal(treasury.address)

		// Check deployment of the MetaproReferral
		transaction = await metaproReferral.setAdminStatus(metaproBuy.address, true)
		await transaction.wait()
		transaction = await metaproReferral.isAdmin(metaproBuy.address)
		expect(transaction).to.true

		// Check deployment of the MetaproBuyNow
		expect(await metaproBuy.metaproReferral()).to.equal(metaproReferral.address)
		expect(await metaproBuy.metaproRoyalty()).to.equal(metaproRoyalty.address)
		expect(await metaproBuy.busd()).to.equal(busd.address)
		expect(await metaproBuy.tressuryAddress()).to.equal(treasury.address)

		//Mint token for the deployer
		const tokenSupply = 1000
		transaction = await metaproMetaAsset
			.connect(deployer)
			.create(deployer.address, 1000, 'bucketHash', 0x00)

		await transaction.wait()
		expect(await metaproMetaAsset.balanceOf(deployer.address, 1001)).to.equal(
			tokenSupply,
		)

		//Approve MetaproINS spending on MetaproMetaAssets
		transaction = await metaproMetaAsset
			.connect(deployer)
			.setApprovalForAll(metaproBuy.address, true)
		await transaction.wait()

		// Create royaltyTeam for tokenId 1001
		transaction = await metaproRoyalty
			.connect(deployer)
			.createTeam(
				1001,
				metaproMetaAsset.address,
				[
					royaltyMember1.address,
					royaltyMember2.address,
					royaltyMember3.address,
				],
				[royaltyFee, royaltyFee, royaltyFee],
			)
		await transaction.wait()
	})

	describe('Deployment', () => {
		it('Get current owner and admin', async () => {
			const currentOwner = await metaproReferral.owner()
			expect(currentOwner).to.equal(deployer.address)
			transaction = await metaproReferral.isAdmin(metaproBuy.address)
			expect(transaction).to.equal(true)
		})
	})

	describe('Create BuyNow auction', () => {
		it('Creates first buyNowAuction with multiple deposits', async () => {
			transaction = await metaproBuy.connect(deployer).createAuction(
				metaproMetaAsset.address,
				1001, // _tokenId
				ethers.utils.parseUnits('1', 18), // _tokenPrice
				100, // _tokenQuantity
				1, // startBlock
				1000, // endBlock
				800, // level1ReferralFee
				400, // level2ReferralFee
				300, // level3ReferralFee
				true, // multipleDeposits
				0x00, // data
			)
			await transaction.wait()
			const buyNowConfig = await metaproBuy.availableBuyNow(1)
			const [tokenId, pricePerToken] = buyNowConfig
			expect(tokenId).to.equal(1001)
			expect(pricePerToken).to.equal(ethers.utils.parseUnits('1', 18))
			const {length, [length - 1]: buyNowId} = buyNowConfig
			multipleDepositsAuctionId = buyNowId
			const buyNowAuctionId = await metaproBuy.currentBuyNowAuctionId()
			expect(buyNowAuctionId).to.equal(1)
			const [ref1, ref2, ref3] = await metaproBuy.buyReferralFees(
				multipleDepositsAuctionId,
			)
			expect(
				_.isEqual(
					[ref1, ref2, ref3],
					[
						BigNumber.from(800), // level1ReferralFee
						BigNumber.from(400), // level2ReferralFee
						BigNumber.from(300), //level3ReferralFee
					],
				),
			).to.true
		})
		it('Correctty saves royalty fees on auction', async () => {
			const [[_1, royFee1], [_2, royFee2], [_3, royFee3]] =
				await metaproBuy.getAuctionRoyaltyFees(multipleDepositsAuctionId)
			expect(royFee1).to.equal(royaltyFee)
			expect(royFee2).to.equal(royaltyFee)
			expect(royFee3).to.equal(royaltyFee)
		})
		it('Creates second buyNowAuction without multiple deposits', async () => {
			transaction = await metaproBuy.connect(deployer).createAuction(
				metaproMetaAsset.address,
				1001, // _tokenId
				ethers.utils.parseUnits('1', 18), // _tokenPrice
				100, // _tokenQuantity
				1, // startBlock
				1000, // endBlock
				500, // level1ReferralFee
				500, // level2ReferralFee
				500, // level3ReferralFee
				false, // multipleDeposits
				0x00, // data
			)
			await transaction.wait()
			const buyNowConfig = await metaproBuy.availableBuyNow(2)
			const [tokenId, pricePerToken] = buyNowConfig
			expect(tokenId).to.equal(1001)
			expect(pricePerToken).to.equal(ethers.utils.parseUnits('1', 18))
			const {length, [length - 1]: buyNowId} = buyNowConfig
			expect(buyNowId).to.equal(2)
			singleDepositAuctionId = buyNowId
			const auctionCount = await metaproBuy.currentBuyNowAuctionId()
			expect(auctionCount).to.equal(2)
			const [ref1, ref2, ref3] = await metaproBuy.buyReferralFees(
				singleDepositAuctionId,
			)
			expect(
				_.isEqual(
					[ref1, ref2, ref3],
					[
						BigNumber.from(500), // level1ReferralFee
						BigNumber.from(500), // level2ReferralFee
						BigNumber.from(500), //level3ReferralFee
					],
				),
			).to.true
		})
	})
	describe('BuyNow auction transaction', () => {
		it('Successfuly make transaction on multiple deposits auction', async () => {
			// #1
			transaction = await metaproBuy
				.connect(level1referrer)
				.buy(multipleDepositsAuctionId, 1, uplineReferrer.address, 0x00)
			await transaction.wait()
			// Check if busd balance decreased after buy transaction
			expect(await busd.balanceOf(level1referrer.address)).to.equal(
				ethers.utils.parseUnits('15', 28).sub(ethers.utils.parseUnits('1', 18)),
			)
			// Check if depositer got the token
			expect(
				await metaproMetaAsset.balanceOf(level1referrer.address, 1001),
			).to.equal(1)
			// #2
			transaction = await metaproBuy
				.connect(level2referrer)
				.buy(multipleDepositsAuctionId, 1, level1referrer.address, 0x00)
			await transaction.wait()
			// #3
			transaction = await metaproBuy
				.connect(level3referrer)
				.buy(multipleDepositsAuctionId, 1, level2referrer.address, 0x00)
			await transaction.wait()
		})
		it('Correctly distribute fees on referrers - auction with multiple deposits', async () => {
			const [lv1RefFee, lv2RefFee, lv3RefFee] =
				await metaproBuy.buyReferralFees(multipleDepositsAuctionId)
			const [
				[contractAddress1, buyNowId, tokenId1, referred1, level1, provision1],
				[el1, el2, el3, referred2, level2, provision2],
				[el4, el5, el6, referred3, level3, provision3],
			] = await metaproReferral.getReferralDeposits(uplineReferrer.address)
			const getDesiredProvision = refFee => {
				return ethers.utils.parseUnits('1', 18).mul(refFee).div(10000)
			}
			expect(contractAddress1).to.equal(metaproBuy.address)
			expect(buyNowId).to.equal(multipleDepositsAuctionId)
			expect(tokenId1).to.equal(1001)
			expect(referred1).to.equal(level1referrer.address)
			expect(level1).to.equal(1)
			expect(referred2).to.equal(level2referrer.address)
			expect(level2).to.equal(2)
			expect(referred3).to.equal(level3referrer.address)
			expect(level3).to.equal(3)
			expect(provision1).to.equal(getDesiredProvision(lv1RefFee))
			expect(provision2).to.equal(getDesiredProvision(lv2RefFee))
			expect(provision3).to.equal(getDesiredProvision(lv3RefFee))
		})
		it('Correctly distribute fees on royalty members - auction with multiple deposits', async () => {
			const [
				[royAddress1, royFee1],
				[royAddress2, royFee2],
				[royAddress3, royFee3],
			] = await metaproBuy.getAuctionRoyaltyFees(multipleDepositsAuctionId)
			// We need to multiple provision by 3 transactions done earlier
			const getDesiredProvision = royFee => {
				return ethers.utils.parseUnits('1', 18).mul(royFee).div(10000).mul(3)
			}

			expect(royaltyMember1.address).to.equal(royAddress1)
			expect(royFee1).to.equal(royaltyFee)
			expect(await busd.balanceOf(royaltyMember1.address)).to.equal(
				getDesiredProvision(royFee1),
			)
			expect(royaltyMember2.address).to.equal(royAddress2)
			expect(royFee2).to.equal(royaltyFee)
			expect(await busd.balanceOf(royaltyMember2.address)).to.equal(
				getDesiredProvision(royFee2),
			)
			expect(royaltyMember3.address).to.equal(royAddress3)
			expect(royFee3).to.equal(royaltyFee)
			expect(await busd.balanceOf(royaltyMember3.address)).to.equal(
				getDesiredProvision(royFee3),
			)
		})
		it('Successfuly make transaction on single deposit auction', async () => {
			// #1
			transaction = await metaproBuy
				.connect(level1referrer)
				.buy(singleDepositAuctionId, 1, uplineReferrer.address, 0x00)
			await transaction.wait()
			// Check if depositer got the token
			expect(
				await metaproMetaAsset.balanceOf(level1referrer.address, 1001),
			).to.equal(2)
			// #2
			transaction = await metaproBuy
				.connect(level2referrer)
				.buy(singleDepositAuctionId, 1, level1referrer.address, 0x00)
			await transaction.wait()
			// #3
			transaction = await metaproBuy
				.connect(level3referrer)
				.buy(singleDepositAuctionId, 1, level2referrer.address, 0x00)
			await transaction.wait()
		})
		it('Correctly distribute fees on referrers - auction with single deposit', async () => {
			const [lv1RefFee, lv2RefFee, lv3RefFee] =
				await metaproBuy.buyReferralFees(singleDepositAuctionId)
			const deposits = await metaproReferral.getReferralDeposits(
				uplineReferrer.address,
			)
			const [
				[empty1],
				[empty2],
				[empty3],
				[contractAddress1, buyNowId, tokenId1, referred1, level1, provision1],
				[el1, el2, el3, referred2, level2, provision2],
				[el4, el5, el6, referred3, level3, provision3],
			] = await metaproReferral.getReferralDeposits(uplineReferrer.address)
			const getDesiredProvision = refFee => {
				return ethers.utils.parseUnits('1', 18).mul(refFee).div(10000)
			}
			expect(contractAddress1).to.equal(metaproBuy.address)
			expect(buyNowId).to.equal(singleDepositAuctionId)
			expect(tokenId1).to.equal(1001)
			expect(referred1).to.equal(level1referrer.address)
			expect(level1).to.equal(1)
			expect(referred2).to.equal(level2referrer.address)
			expect(level2).to.equal(2)
			expect(referred3).to.equal(level3referrer.address)
			expect(level3).to.equal(3)
			expect(provision1).to.equal(getDesiredProvision(lv1RefFee))
			expect(provision2).to.equal(getDesiredProvision(lv2RefFee))
			expect(provision3).to.equal(getDesiredProvision(lv3RefFee))
		})
		it('Suppose to block second buy on single deposit', async () => {
			try {
				transaction = await metaproBuy
					.connect(level1referrer)
					.buy(singleDepositAuctionId, 1, uplineReferrer.address, 0x00)
				await transaction.wait()
			} catch (error) {
				expect(error).to.not.be.empty
			}
		})
	})
	describe('Auction termination', () => {
		it('Succesfuly terminates auction', async () => {
			let finishedBuyTokenIds, activeBuyTokenIds
			transaction = await metaproBuy.closeAuction(
				multipleDepositsAuctionId,
				0x00,
			)
			await transaction.wait()
			expect(await metaproMetaAsset.balanceOf(deployer.address, 1001)).to.equal(
				897, // 1000 - 100 (singleDepositAuction) - 3 (bought tokens from multipleDepositsAuction)
			)
			finishedBuyTokenIds = await metaproBuy.getFinishedBuyNowTokenIds()
			activeBuyTokenIds = await metaproBuy.getActiveBuyNowTokenIds()
			expect(finishedBuyTokenIds.length).to.equal(0)
			expect(activeBuyTokenIds.length).to.equal(1)
			transaction = await metaproBuy.closeAuction(singleDepositAuctionId, 0x00)
			await transaction.wait()
			finishedBuyTokenIds = await metaproBuy.getFinishedBuyNowTokenIds()
			activeBuyTokenIds = await metaproBuy.getActiveBuyNowTokenIds()
			expect(finishedBuyTokenIds.length).to.equal(1)
			expect(activeBuyTokenIds.length).to.equal(0)
		})
	})
	describe('Batch auctions', () => {
		it('Returns correct multipleDepositsAuctionId', async () => {
			const [auction] = await metaproBuy.getBatchAuctions([1, 2])
			const {length, [length - 1]: buyNowId} = auction
			expect(buyNowId).to.equal(BigNumber.from(multipleDepositsAuctionId))
		})
		it('Returns correct singleDepositAuctionId', async () => {
			const [_1, auction] = await metaproBuy.getBatchAuctions([1, 2])
			const {length, [length - 1]: buyNowId} = auction
			expect(buyNowId).to.equal(BigNumber.from(singleDepositAuctionId))
		})
		it('Reverts when one of auction ids does not exist', async () => {
			try {
				await metaproBuy.getBatchAuctions([1, 3])
			} catch (error) {
				expect(error).to.not.be.empty
			}
		})
	})
})
