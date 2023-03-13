const {expect} = require('chai')
const {BigNumber} = require('ethers')
const {ethers} = require('hardhat')
const {mine} = require('@nomicfoundation/hardhat-network-helpers')
const _ = require('lodash')

// test command => npx hardhat test test/MetaproIns.js

describe('MetaproINS', () => {
	const tressuryFee = 500 // 250 = 2.5%
	const royaltyFee = 100 // 300 = 3%
	let metaproMetaAsset
	let anotherMetaAsset
	let busd
	let metaproReferral
	let metaproRoyalty
	let metaproINS

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
	let currentInsId
	let error

	const tokenSupply = 10000000

	beforeEach(() => {
		error = undefined
	})

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

		anotherMetaAsset = await MetaproMetaAsset.deploy(
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
		const MetaproINS = await ethers.getContractFactory('MetaproINSv1')
		metaproINS = await MetaproINS.deploy(
			busd.address,
			treasury.address,
			metaproReferral.address,
			metaproRoyalty.address,
		)
		// Approve INS creator for spending busd
		transaction = await busd
			.connect(deployer)
			.approve(metaproINS.address, ethers.utils.parseUnits('99999999', 18))
		await transaction.wait()
		// Approve level1Referrer for spending busd
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
					.approve(
						metaproINS.address,
						ethers.utils.parseUnits('999999999999999999999', 18),
					)
				await transaction.wait()
			}),
		)

		// Send busd to level1Referrer to deposit on INS
		await transaction.wait()
		// Check deployment of the MetaproMetaAsset
		expect(await metaproMetaAsset.treasuryAddress()).to.equal(treasury.address)

		// Check deployment of the MetaproReferral
		transaction = await metaproReferral
			.connect(deployer)
			.setAdminStatus(metaproINS.address, true)
		await transaction.wait()
		transaction = await metaproReferral.isAdmin(metaproINS.address)
		expect(transaction).to.true

		// Check deployment of the MetaproINS
		expect(await metaproINS.metaproReferral()).to.equal(metaproReferral.address)
		expect(await metaproINS.metaproRoyalty()).to.equal(metaproRoyalty.address)
		expect(await metaproINS.busd()).to.equal(busd.address)
		expect(await metaproINS.tressuryAddress()).to.equal(treasury.address)

		//Mint token for the deployer
		// ID - 1001
		transaction = await metaproMetaAsset
			.connect(deployer)
			.create(deployer.address, tokenSupply, 'bucketHash1', 0x00)

		await transaction.wait()
		transaction = expect(
			await metaproMetaAsset.balanceOf(deployer.address, 1001),
		).to.equal(tokenSupply)
		// ID - 1002
		transaction = await metaproMetaAsset
			.connect(deployer)
			.create(deployer.address, tokenSupply, 'bucketHash2', 0x00)

		await transaction.wait()
		transaction = expect(
			await metaproMetaAsset.balanceOf(deployer.address, 1002),
		).to.equal(tokenSupply)
		// ID - 1001
		transaction = await anotherMetaAsset
			.connect(deployer)
			.create(deployer.address, tokenSupply, 'bucketHash', 0x00)

		await transaction.wait()
		transaction = expect(
			await anotherMetaAsset.balanceOf(deployer.address, 1001),
		).to.equal(tokenSupply)

		//Approve MetaproINS spending on MetaproMetaAssets and AnotherMetaAsset
		transaction = await metaproMetaAsset
			.connect(deployer)
			.setApprovalForAll(metaproINS.address, true)
		await transaction.wait()

		transaction = await anotherMetaAsset
			.connect(deployer)
			.setApprovalForAll(metaproINS.address, true)
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

	describe('Create INS properly', () => {
		it('Suppose to return created ins configuration properly', async () => {
			// Ins id - 1
			transaction = await metaproINS.connect(deployer).create(
				metaproMetaAsset.address,
				1001, // tokenID
				0, // minCap
				100, // maxCap
				ethers.utils.parseUnits('1', 18), // pricePerToken
				1, // startBlock
				1000, // endBlock
				true, // multipleDeposits
				500, // level1ReferralFee
				500, // level2ReferralFee
				500, // level3ReferralFee
				0x00, // data
			)
			await transaction.wait()
			// Ins id - 2
			transaction = await metaproINS.connect(deployer).create(
				anotherMetaAsset.address,
				1001, // tokenID
				0, // minCap
				100, // maxCap
				ethers.utils.parseUnits('1', 18), // pricePerToken
				1, // startBlock
				1000, // endBlock
				true, // multipleDeposits
				500, // level1ReferralFee
				500, // level2ReferralFee
				500, // level3ReferralFee
				0x00, // data
			)
			await transaction.wait()
			const insConfig = await metaproINS.availableIns(1)
			const [tokenId, pricePerToken] = insConfig
			const {length, [length - 1]: insId} = insConfig
			currentInsId = insId
			expect(tokenId).to.equal(1001)
			expect(pricePerToken).to.equal(ethers.utils.parseUnits('1', 18))
		})
		it('Adds created ins ids properly', async () => {
			const insIds = await metaproINS.getCreatedInsIds()
			expect(_.isEqual(insIds, [BigNumber.from(1), BigNumber.from(2)])).to.true
		})
		it('Returns created ins by getBatchIns', async () => {
			const ins = await metaproINS.getBatchIns([1, 2])
			expect(ins.length).to.equal(2)
		})
		it('Correctly save created INS ids', async () => {
			const [insId] = await metaproINS.getCreatedInsIds()
			expect(insId).to.equal(currentInsId)
		})
		it('Correctly save token INS ids', async () => {
			const [[tokenId]] = await metaproINS.getTokenIns(1001)
			expect(tokenId).to.equal(1001)
		})
		it('Correctly save ins on actives', async () => {
			const [[tokenId]] = await metaproINS.getAllAvailableIns()
			expect(tokenId).to.equal(1001)
			const [[tokId]] = await metaproINS.getActiveInsTokenIds()
			expect(tokId).to.equal(1001)
		})
	})

	describe('Unhappy path on ins create', () => {
		it('Should return an error when startBlock is greater that endBlock', async () => {
			try {
				transaction = await metaproINS.connect(deployer).create(
					anotherMetaAsset.address,
					1001, // tokenID
					0, // minCap
					100, // maxCap
					ethers.utils.parseUnits('1', 18), // pricePerToken
					100, // startBlock
					1, // endBlock
					true, // multipleDeposits
					500, // level1ReferralFee
					500, // level2ReferralFee
					500, // level3ReferralFee
					0x00, // data
				)
				await transaction.wait()
			} catch (err) {
				error = err
			}
			expect(error).to.not.be.empty
		})
		it('Should return an error when tokenId has negative value', async () => {
			try {
				transaction = await metaproINS.connect(deployer).create(
					anotherMetaAsset.address,
					0, // tokenID
					0, // minCap
					100, // maxCap
					ethers.utils.parseUnits('1', 18), // pricePerToken
					1, // startBlock
					100, // endBlock
					true, // multipleDeposits
					500, // level1ReferralFee
					500, // level2ReferralFee
					500, // level3ReferralFee
					0x00, // data
				)
				await transaction.wait()
			} catch (err) {
				error = err
			}
			expect(error).to.not.be.empty
		})
	})

	describe('Deposit on INS', () => {
		it('Suppose to deposit on ins with all given configuration', async () => {
			// #1
			transaction = await metaproINS
				.connect(level1referrer)
				.deposit(currentInsId, 1, uplineReferrer.address)
			await transaction.wait()
			// #2
			transaction = await metaproINS
				.connect(level2referrer)
				.deposit(currentInsId, 1, level1referrer.address)
			await transaction.wait()
			// #3
			transaction = await metaproINS
				.connect(level3referrer)
				.deposit(currentInsId, 1, level2referrer.address)
			await transaction.wait()
		})
		it('Suppose to increase currentCapInBUSD on given INS properly', async () => {
			const insConfig = await metaproINS.availableIns(currentInsId)
			const {length, [length - 4]: currentCapInBusd} = insConfig
			// To equal amount depends how many deposits are made earlier - example #1 -> 1, #1, #2 -> 2
			expect(currentCapInBusd).to.equal(ethers.utils.parseUnits('3', 18))
		})
		it('Suppose to increase currentCap on given INS properly', async () => {
			const insConfig = await metaproINS.availableIns(currentInsId)
			const {length, [length - 3]: currentCap} = insConfig
			// To equal amount depends how many deposits are made earlier - example #1 -> 1, #1, #2 -> 2
			expect(currentCap).to.equal(3)
		})
		it('Suppose to save upline referrer properly', async () => {
			const [upRef] = await metaproReferral.getReferralStructure(
				level1referrer.address,
			)
			expect(upRef).to.equal(uplineReferrer.address)
		})
		it('Correctly save users deposit on INS', async () => {
			const [[walletAddress, amount]] = await metaproINS.getInsWalletDeposits(
				currentInsId,
				level1referrer.address,
			)
			expect(walletAddress).to.equal(level1referrer.address)
			expect(amount).to.equal(ethers.utils.parseUnits('1', 18))
		})
	})

	describe('Withdraw on INS', () => {
		it('Successfully withraw by operator', async () => {
			await mine(1000)
			const preWithdrawTokenBalance = await metaproMetaAsset.balanceOf(
				deployer.address,
				1001,
			)
			const [, , , , , maxCap, , , , , , currentCap] =
				await metaproINS.availableIns(currentInsId)
			transaction = await metaproINS
				.connect(deployer)
				.withdraw(currentInsId, 0x00)

			await transaction.wait()
			const postWithdrawTokenBalance = await metaproMetaAsset.balanceOf(
				deployer.address,
				1001,
			)
			expect(
				postWithdrawTokenBalance
					.sub(preWithdrawTokenBalance)
					.eq(maxCap.sub(currentCap)),
			).to.be.true
		})
		it('Correctly withdraw by all depositors', async () => {
			transaction = await metaproINS
				.connect(level1referrer)
				.withdraw(currentInsId, 0x00)
			await transaction.wait()
			transaction = await metaproINS
				.connect(level2referrer)
				.withdraw(currentInsId, 0x00)
			await transaction.wait()
			transaction = await metaproINS
				.connect(level3referrer)
				.withdraw(currentInsId, 0x00)
			await transaction.wait()
			const level1referrerBalance = await metaproMetaAsset.balanceOf(
				level1referrer.address,
				1001,
			)
			const level2referrerBalance = await metaproMetaAsset.balanceOf(
				level2referrer.address,
				1001,
			)
			const level3referrerBalance = await metaproMetaAsset.balanceOf(
				level3referrer.address,
				1001,
			)
			expect(level1referrerBalance.eq(BigNumber.from(1))).to.be.true
			expect(level2referrerBalance.eq(BigNumber.from(1))).to.be.true
			expect(level3referrerBalance.eq(BigNumber.from(1))).to.be.true
		})
		it('Correctly close ins when all withdraws are made', async () => {
			const insConfig = await metaproINS.availableIns(currentInsId)
			const {length, [length - 2]: valid} = insConfig
			expect(valid).to.false
		})
		it('Add depositer correctly to referralStructure', async () => {
			const [_, [level1]] = await metaproReferral.getReferralStructure(
				uplineReferrer.address,
			)
			expect(level1).to.equal(level1referrer.address)
		})
		it('Add deposit correctly to referralDeposits', async () => {
			const [lv1RefFee, lv2RefFee, lv3RefFee] =
				await metaproINS.insReferralFees(currentInsId)
			const [
				[contractAddress1, insId1, tokenId1, referred1, level1, provision1],
				[el1, el2, el3, referred2, level2, provision2],
				[el4, el5, el6, referred3, level3, provision3],
			] = await metaproReferral.getReferralDeposits(uplineReferrer.address)
			const getDesiredProvision = refFee => {
				return ethers.utils.parseUnits('1', 18).mul(refFee).div(10000)
			}
			expect(contractAddress1).to.equal(metaproINS.address)
			expect(insId1).to.equal(currentInsId)
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
		it('Send correct treasury fee to treasury address', async () => {
			const insConfig = await metaproINS.availableIns(currentInsId)
			const {length, [length - 4]: currentCapInBusd} = insConfig
			const desiredTreasuryFee = currentCapInBusd.mul(tressuryFee).div(10000)
			transaction = await busd.balanceOf(treasury.address)
			expect(transaction).to.equal(desiredTreasuryFee)
		})
		it('Get proper royalty value for insId', async () => {
			const insConfig = await metaproINS.availableIns(currentInsId)
			const {length, [length - 4]: currentCapInBusd} = insConfig
			const desiredRoyaltyFee = currentCapInBusd.mul(royaltyFee).div(10000)
			const [_, royFee] = await metaproINS.insRoyaltyTeamMembers(1, 0)
			expect(royFee).to.equal(royaltyFee)
			transaction = await busd.balanceOf(royaltyMember1.address)
			expect(transaction).to.equal(desiredRoyaltyFee)
		})
		it('Withdraw all busd from ins contract', async () => {
			expect(await busd.balanceOf(metaproINS.address)).to.equal(0)
		})
		it('Do not remove tokenId from activeInsTokenIds', async () => {
			const tokenIds = await metaproINS.getActiveInsTokenIds()
			expect(tokenIds.length).to.equal(2)
		})
		it('Do not add tokenId to finishedInsTokenIds', async () => {
			const [tokenId] = await metaproINS.getFinishedInsTokenIds()
			expect(tokenId).to.be.undefined
		})
		it('Remove tokenId from activeInsTokenIds', async () => {
			transaction = await metaproINS.connect(deployer).withdraw(2, 0x00)
			await transaction.wait()
			const tokenIds = await metaproINS.getActiveInsTokenIds()
			expect(tokenIds.length).to.equal(1)
		})
		it('Add tokenId to finishedInsTokenIds', async () => {
			const tokenIns = await metaproINS.getFinishedInsTokenIds()
			expect(tokenIns[0][0]).to.equal(1001)
			expect(tokenIns.length).to.equal(1)
		})
	})
	describe('Closing auction when maxCap is reached', () => {
		it('Allow to close ins once the maxCap is reached', async () => {
			const currentBlockNumber = await ethers.provider.getBlockNumber()
			// Ins id - 3
			transaction = await metaproINS.connect(deployer).create(
				metaproMetaAsset.address,
				1001, // tokenID
				0, // minCap
				100, // maxCap
				ethers.utils.parseUnits('1', 18), // pricePerToken
				currentBlockNumber, // startBlock
				currentBlockNumber + 100, // endBlock
				true, // multipleDeposits
				500, // level1ReferralFee
				500, // level2ReferralFee
				500, // level3ReferralFee
				0x00, // data
			)
			await transaction.wait()

			transaction = await metaproINS
				.connect(level1referrer)
				.deposit(3, 100, uplineReferrer.address)
			await transaction.wait()
			const preWithdrawDepositorBalance = await metaproMetaAsset.balanceOf(
				level1referrer.address,
				1001,
			)
			transaction = await metaproINS.connect(level1referrer).withdraw(3, 0x00)
			await transaction.wait()
			const postWithdrawDepositorBalance = await metaproMetaAsset.balanceOf(
				level1referrer.address,
				1001,
			)
			expect(
				postWithdrawDepositorBalance
					.sub(preWithdrawDepositorBalance)
					.eq(BigNumber.from(100)),
			).to.be.true
		})
	})
	describe('Finilize ins by ins depositer', () => {
		it('Allow to finilize ins and only withdraw single depositer tokens', async () => {
			const currentBlockNumber = await ethers.provider.getBlockNumber()
			// Ins id - 4
			transaction = await metaproINS.connect(deployer).create(
				metaproMetaAsset.address,
				1002, // tokenID
				0, // minCap
				100, // maxCap
				ethers.utils.parseUnits('1', 18), // pricePerToken
				currentBlockNumber, // startBlock
				currentBlockNumber + 100, // endBlock
				true, // multipleDeposits
				500, // level1ReferralFee
				500, // level2ReferralFee
				500, // level3ReferralFee
				0x00, // data
			)
			await transaction.wait()

			const array = new Array(1).fill(0)

			// It will produce 60 deposits
			await Promise.all(
				array.map(async () => {
					// #1
					transaction = await metaproINS
						.connect(level1referrer)
						.deposit(4, 1, uplineReferrer.address)
					await transaction.wait()
					// #2
					transaction = await metaproINS
						.connect(level2referrer)
						.deposit(4, 1, level1referrer.address)
					await transaction.wait()
					// #3
					transaction = await metaproINS
						.connect(level3referrer)
						.deposit(4, 1, level2referrer.address)
					await transaction.wait()
				}),
			)

			await mine(1000)
			const gasFeeOnDepositer = await metaproINS
				.connect(level1referrer)
				.estimateGas.withdraw(4, 0x00)
			transaction = await metaproINS.connect(level1referrer).withdraw(4, 0x00)
			await transaction.wait()
			const operatorBalance = await metaproMetaAsset.balanceOf(
				deployer.address,
				1002,
			)
			expect(operatorBalance).to.equal(
				BigNumber.from(tokenSupply).sub(BigNumber.from(100)),
			)
			const gasFeeOnOperator = await metaproINS
				.connect(deployer)
				.estimateGas.withdraw(4, 0x00)
			transaction = await metaproINS.connect(deployer).withdraw(4, 0x00)
			await transaction.wait()
		})
	})
	describe('Emergency withdraw by contract owner', () => {
		it('Allow to withdraw all tokens from ins', async () => {
			const currentBlockNumber = await ethers.provider.getBlockNumber()
			// Ins id - 5
			transaction = await metaproINS.connect(deployer).create(
				metaproMetaAsset.address,
				1002, // tokenID
				0, // minCap
				100, // maxCap
				ethers.utils.parseUnits('1', 18), // pricePerToken
				currentBlockNumber, // startBlock
				currentBlockNumber + 100, // endBlock
				true, // multipleDeposits
				500, // level1ReferralFee
				500, // level2ReferralFee
				500, // level3ReferralFee
				0x00, // data
			)

			await transaction.wait()
			const token1002BalancePrewithdraw = await metaproMetaAsset.balanceOf(
				deployer.address,
				1002,
			)
			transaction = await metaproINS
				.connect(deployer)
				.emergencyInsWithdraw(5, 0x00)
			await transaction.wait()
			const token1002BalancePostwithdraw = await metaproMetaAsset.balanceOf(
				deployer.address,
				1002,
			)
			expect(
				token1002BalancePostwithdraw
					.sub(token1002BalancePrewithdraw)
					.eq(BigNumber.from(100)),
			).to.be.true
		})
	})
	describe('Closinng ins when minCap is not reached', () => {
		it('Allow to withdraw deposit by depositor', async () => {
			const currentBlockNumber = await ethers.provider.getBlockNumber()
			// Ins id - 6
			transaction = await metaproINS.connect(deployer).create(
				metaproMetaAsset.address,
				1002, // tokenID
				90, // minCap
				100, // maxCap
				ethers.utils.parseUnits('10000000', 18), // pricePerToken
				currentBlockNumber, // startBlock
				currentBlockNumber + 100, // endBlock
				true, // multipleDeposits
				500, // level1ReferralFee
				500, // level2ReferralFee
				500, // level3ReferralFee
				0x00, // data
			)
			await transaction.wait()
			// Deposit on newly created ins
			transaction = await metaproINS
				.connect(level1referrer)
				.deposit(6, 80, uplineReferrer.address)
			await transaction.wait()
			// Mine blocks to be able to withdraw
			await mine(100)
			transaction = await metaproINS.connect(level1referrer).withdraw(6, 0x00)
			await transaction.wait()
			transaction = await metaproINS.connect(deployer).withdraw(6, 0x00)
			await transaction.wait()
		})
	})
})
