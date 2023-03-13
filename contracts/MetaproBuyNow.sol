//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./MetaproMetaAsset.sol";
import "./libraries/Royalty.sol";
import "./libraries/Referral.sol";
import "hardhat/console.sol";

contract MetaproBuyNow is Ownable, ReentrancyGuard, ERC1155Holder {
    using SafeMath for uint256;

    struct BuyNowConfiguration {
        // @dev: nft token id
        uint256 tokenId;
        // @dev: price per 1 nft token - value in busd
        uint256 pricePerToken;
        // @dev: BuyNowAuction max token buy - value in NFT token quantity
        uint256 tokenQuantity;
        // @dev: BuyNowAuction starting block
        uint256 startBlock;
        // @dev: BuyNowAuction ending block
        uint256 endBlock;
        // @dev: Allow principants to do multiple buy
        bool multipleDeposits;
        // @dev: Tokens sold on the BuyNowAuction
        uint256 tokensSold;
        // @dev: BuyNowAuction creator
        address operator;
        // @dev: BuyNowAuction validity - value in boolean
        bool valid;
        // @dev: BuyNowAuction id
        uint256 buyNowId;
    }

    struct TokenBuyNow {
        uint256 tokenId;
        address tokenContractAddress;
    }

    struct WalletBuyNow {
        uint256 buyNowId;
    }

    struct BuyNowDeposit {
        // @dev: principal wallet address
        address wallet;
        // @dev: deposit amount in busd
        uint256 amount;
        // @dev: deposit blockNumber
        uint256 blockNumber;
    }

    // Contracts
    IERC20 public busd;
    MetaproReferral public metaproReferral;
    MetaproRoyalty public metaproRoyalty;

    //Contract addresses
    address private busdAddress;
    address public tressuryAddress;
    address private referralAddress;
    address private royaltyAddress;

    mapping(uint256 => BuyNowConfiguration) public availableBuyNow;

    // @dev: Buy auction token contract address buyNowId => contractAddress
    mapping(uint256 => address) private buyAuctionTokenContractAddress;

    // @dev: auctionID => Referral.ReferralFees
    mapping(uint256 => Referral.ReferralFees) public buyReferralFees;

    // @dev: buyNowId => Royalty.RoyaltyTeamMember[]
    mapping(uint256 => Royalty.RoyaltyTeamMember[])
        private buyNowRoyaltyTeamMembers;

    // @dev: Tressury fee - interger value - example: 500 -> 5%
    uint256 public treasuryFee = 500; // 500 = 5%

    // @dev: buyNowId => BuyNowDeposit[]
    mapping(uint256 => BuyNowDeposit[]) private buyNowDeposits;

    // @dev: dictionary with WalletIns[] - wallet address => WalletIns[]
    mapping(address => WalletBuyNow[]) private walletBuyNow;

    uint256[] private createdBuyNowIds;

    TokenBuyNow[] private activeBuyNowTokenIds;

    TokenBuyNow[] private finishedBuyNowTokenIds;

    // Current buyNow auction id - by default is zero
    uint256 public currentBuyNowAuctionId = 0;

    event BuyAuctionCreated(
        address indexed tokenContractAddress,
        uint256 indexed tokenId,
        uint256 tokenPrice,
        uint256 tokenQuantity,
        uint256 startBlock,
        uint256 endBlock,
        bool multipleDeposits,
        address operator,
        uint256 indexed buyNowId
    );
    event Buy(
        uint256 indexed tokenId,
        address indexed tokenContractAddress,
        uint256 indexed buyNowId,
        uint256 tokenQuantity,
        address referrer
    );
    event CloseAuction(uint256 tokenId, uint256 buyNowId);

    event TreasuryFeeUpdated(uint256 _fee);
    event BUSDAddressUpdated(address _address);
    event TressuryAddressUpdated(address _address);
    event ReferralAddressUpdated(address _address);
    event RoyaltyAddressUpdated(address _address);

    constructor(
        address _busdAddress,
        address _tressuryAddress,
        address _referralAddress,
        address _royaltyAddress
    ) {
        busd = IERC20(_busdAddress);
        tressuryAddress = _tressuryAddress;
        metaproReferral = MetaproReferral(_referralAddress);
        referralAddress = _referralAddress;
        metaproRoyalty = MetaproRoyalty(_royaltyAddress);
        royaltyAddress = _royaltyAddress;
    }

    function createAuction(
        address _tokenContractAddress,
        uint256 _tokenId,
        uint256 _tokenPrice,
        uint256 _tokenQuantity,
        uint256 _startBlock,
        uint256 _endBlock,
        uint256 _level1ReferralFee,
        uint256 _level2ReferralFee,
        uint256 _level3ReferralFee,
        bool _multipleDeposits,
        bytes memory _data
    ) public nonReentrant returns (uint256) {
        require(
            Address.isContract(_tokenContractAddress),
            "Provide valid contract address"
        );
        require(
            IERC1155(_tokenContractAddress).balanceOf(msg.sender, _tokenId) >=
                _tokenQuantity,
            "Insufficient ERC1155 balance"
        );
        require(_tokenId > 0, "INS: tokenId must be greater than 0");
        require(_tokenPrice > 0, "INS: pricePerToken must ge greater than 0");
        require(
            _level1ReferralFee.add(_level2ReferralFee).add(
                _level3ReferralFee
            ) <= 1500,
            "The sum of referral fees can not be greater than 15%"
        );
        require(
            _startBlock < _endBlock,
            "INS: startBlock must be less than endBlock"
        );

        IERC1155(_tokenContractAddress).safeTransferFrom(
            msg.sender,
            address(this),
            _tokenId,
            _tokenQuantity,
            _data
        );

        BuyNowConfiguration memory auctionConfiguration = BuyNowConfiguration(
            _tokenId,
            _tokenPrice,
            _tokenQuantity,
            _startBlock,
            _endBlock,
            _multipleDeposits,
            0,
            msg.sender,
            true,
            currentBuyNowAuctionId + 1
        );

        buyAuctionTokenContractAddress[
            currentBuyNowAuctionId + 1
        ] = _tokenContractAddress;

        saveBuyReferralFees(
            currentBuyNowAuctionId + 1,
            _level1ReferralFee,
            _level2ReferralFee,
            _level3ReferralFee
        );

        saveBuyRoyaltyFees(currentBuyNowAuctionId + 1, _tokenId);

        availableBuyNow[currentBuyNowAuctionId + 1] = auctionConfiguration;

        activateTokenId(
            currentBuyNowAuctionId + 1,
            _tokenId,
            _tokenContractAddress
        );

        emit BuyAuctionCreated(
            _tokenContractAddress,
            _tokenId,
            _tokenPrice,
            _tokenQuantity,
            _startBlock,
            _endBlock,
            _multipleDeposits,
            msg.sender,
            currentBuyNowAuctionId + 1
        );

        // Add buyNow to wallet
        addBuyNowToWallet(currentBuyNowAuctionId + 1, msg.sender);

        currentBuyNowAuctionId++;

        return currentBuyNowAuctionId;
    }

    function buy(
        uint256 _buyNowId,
        uint256 _tokenQuantity,
        address _referrer,
        bytes memory _data
    ) public nonReentrant {
        BuyNowConfiguration storage currentAuction = availableBuyNow[_buyNowId];

        Referral.ReferralFees storage refFees = buyReferralFees[_buyNowId];

        require(_tokenQuantity > 0, "Token quantity must be positive value");

        require(
            currentAuction.startBlock <= block.number,
            "Auction has not started yet."
        );
        require(
            currentAuction.endBlock >= block.number,
            "Auction has already ended."
        );

        uint256 tokenAmount = currentAuction.tokenQuantity -
            currentAuction.tokensSold;

        require(
            tokenAmount >= _tokenQuantity,
            "Offered quantity is greater than available tokens."
        );
        require(
            currentAuction.tokenQuantity >=
                _tokenQuantity + currentAuction.tokensSold,
            "Token quantity exceeded for this auction."
        );

        require(
            currentAuction.valid == true,
            "Can not proccess on disabled auction"
        );

        if (
            currentAuction.tokensSold + _tokenQuantity ==
            currentAuction.tokenQuantity
        ) {
            currentAuction.valid = false;
            finalizeTokenId(
                currentAuction.tokenId,
                buyAuctionTokenContractAddress[_buyNowId],
                _buyNowId
            );
        }

        uint256 transactionAmount = _tokenQuantity *
            currentAuction.pricePerToken;

        busd.transferFrom(msg.sender, address(this), transactionAmount);

        handleMultipleDepositsCheck(currentAuction, transactionAmount);

        metaproReferral.setReferral(msg.sender, _referrer);

        uint256 referralFeeAmount = sendFeesToReferrers(
            currentAuction,
            refFees,
            transactionAmount,
            msg.sender
        );

        uint256 royaltyFeeAmount = sendFeesToRoyaltyTeamMembers(
            currentAuction,
            transactionAmount
        );

        uint256 treasuryFeeAmount = (transactionAmount.mul(treasuryFee)).div(
            10000
        );

        // Send fee to trasury address
        busd.transfer(tressuryAddress, treasuryFeeAmount);

        busd.transfer(
            currentAuction.operator,
            transactionAmount -
                referralFeeAmount -
                royaltyFeeAmount -
                treasuryFeeAmount
        );

        // Send tokens to depositer
        IERC1155(buyAuctionTokenContractAddress[_buyNowId]).safeTransferFrom(
            address(this),
            msg.sender,
            currentAuction.tokenId,
            _tokenQuantity,
            _data
        );

        availableBuyNow[_buyNowId].tokensSold += _tokenQuantity;

        // Add buyNow to wallet
        addBuyNowToWallet(currentAuction.buyNowId, msg.sender);

        emit Buy(
            currentAuction.tokenId,
            buyAuctionTokenContractAddress[_buyNowId],
            _buyNowId,
            _tokenQuantity,
            _referrer
        );
    }

    function addBuyNowToWallet(
        uint256 _buyNowId,
        address _walletAddress
    ) private {
        bool buyNowAdded = false;
        for (uint256 i = 0; i < walletBuyNow[_walletAddress].length; i++) {
            if (walletBuyNow[_walletAddress][i].buyNowId == _buyNowId)
                buyNowAdded = true;
        }
        WalletBuyNow memory _walletBuyNow = WalletBuyNow({buyNowId: _buyNowId});
        if (!buyNowAdded) walletBuyNow[_walletAddress].push(_walletBuyNow);
    }

    function activateTokenId(
        uint256 _buyNowId,
        uint256 _tokenId,
        address _tokenContractAddress
    ) private {
        // To avoid duplication we need to check if active _tokenId already exists
        createdBuyNowIds.push(_buyNowId);
        bool enableToActivate = true;
        for (uint256 i = 0; i < activeBuyNowTokenIds.length; i++) {
            if (
                activeBuyNowTokenIds[i].tokenId == _tokenId &&
                activeBuyNowTokenIds[i].tokenContractAddress ==
                _tokenContractAddress
            ) {
                enableToActivate = false;
            }
        }

        TokenBuyNow memory tokenAuction = TokenBuyNow(
            _tokenId,
            _tokenContractAddress
        );

        if (enableToActivate) {
            activeBuyNowTokenIds.push(tokenAuction);
        }

        // We need to back remove _tokenId from finished
        for (uint256 i = 0; i < finishedBuyNowTokenIds.length; i++) {
            if (
                finishedBuyNowTokenIds[i].tokenId == _tokenId &&
                finishedBuyNowTokenIds[i].tokenContractAddress ==
                _tokenContractAddress
            ) {
                delete finishedBuyNowTokenIds[i];
            }
        }
    }

    function finalizeTokenId(
        uint256 _tokenId,
        address _tokenContractAddress,
        uint256 _buyNowId
    ) private {
        BuyNowConfiguration[]
            memory tokenAuctionConfigurations = getTokenBuyNow(_tokenId);
        TokenBuyNow memory tokenAuction = TokenBuyNow(
            _tokenId,
            _tokenContractAddress
        );

        bool allInsForTokenIdFinalized = true;

        for (uint256 i = 0; i < tokenAuctionConfigurations.length; i++) {
            if (
                tokenAuctionConfigurations[i].valid &&
                tokenAuctionConfigurations[i].buyNowId != _buyNowId
            ) {
                allInsForTokenIdFinalized = false;
            }
        }

        if (allInsForTokenIdFinalized) {
            for (uint256 i = 0; i < activeBuyNowTokenIds.length; i++) {
                if (
                    activeBuyNowTokenIds[i].tokenId == _tokenId &&
                    activeBuyNowTokenIds[i].tokenContractAddress ==
                    _tokenContractAddress
                ) {
                    delete activeBuyNowTokenIds[i];
                    finishedBuyNowTokenIds.push(tokenAuction);
                }
            }
        }
    }

    function getWalletIns(
        address _walletAddress
    ) public view returns (WalletBuyNow[] memory) {
        return walletBuyNow[_walletAddress];
    }

    function getTokenBuyNow(
        uint256 _tokenId
    ) public view returns (BuyNowConfiguration[] memory) {
        uint256 correctArraySize = 0;

        for (uint256 i = 0; i < createdBuyNowIds.length; i++) {
            if (availableBuyNow[createdBuyNowIds[i]].tokenId == _tokenId) {
                correctArraySize += 1;
            }
        }

        BuyNowConfiguration[] memory tokenAuctions = new BuyNowConfiguration[](
            correctArraySize
        );

        uint256 correctIndex = 0;
        for (uint256 i = 0; i < createdBuyNowIds.length; i++) {
            if (availableBuyNow[createdBuyNowIds[i]].tokenId == _tokenId) {
                tokenAuctions[correctIndex] = availableBuyNow[
                    createdBuyNowIds[i]
                ];
                correctIndex++;
            }
        }

        return tokenAuctions;
    }

    function handleMultipleDepositsCheck(
        BuyNowConfiguration memory _buyConfiguration,
        uint256 _transactionAmount
    ) private {
        BuyNowDeposit memory walletDeposit = BuyNowDeposit(
            msg.sender,
            _transactionAmount,
            block.number
        );
        if (_buyConfiguration.multipleDeposits) {
            buyNowDeposits[_buyConfiguration.buyNowId].push(walletDeposit);
        } else {
            BuyNowDeposit[] memory insDeposits = buyNowDeposits[
                _buyConfiguration.buyNowId
            ];
            bool deposited = false;
            for (uint256 i = 0; i < insDeposits.length; ++i) {
                if (insDeposits[i].wallet == msg.sender) {
                    deposited = true;
                }
            }

            if (deposited) {
                revert("MetaproBuy: doesn't support multiple deposits");
            } else {
                buyNowDeposits[_buyConfiguration.buyNowId].push(walletDeposit);
            }
        }
    }

    function closeAuction(uint256 _buyNowId, bytes memory _data) public {
        BuyNowConfiguration storage currentAuction = availableBuyNow[_buyNowId];
        require(
            currentAuction.operator == msg.sender,
            "Wallet must be auction operator"
        );
        require(currentAuction.valid == true, "Auction is already closed");
        currentAuction.valid = false;
        finalizeTokenId(
            currentAuction.tokenId,
            buyAuctionTokenContractAddress[_buyNowId],
            _buyNowId
        );
        (currentAuction);
        IERC1155(buyAuctionTokenContractAddress[_buyNowId]).safeTransferFrom(
            address(this),
            msg.sender,
            currentAuction.tokenId,
            currentAuction.tokenQuantity - currentAuction.tokensSold,
            _data
        );

        emit CloseAuction(currentAuction.tokenId, _buyNowId);
    }

    function getBuyNowDeposits(
        uint256 _buyNowId
    ) public view returns (BuyNowDeposit[] memory) {
        return buyNowDeposits[_buyNowId];
    }

    function getAuctionRoyaltyFees(
        uint256 _buyNowId
    ) public view returns (Royalty.RoyaltyTeamMember[] memory) {
        return buyNowRoyaltyTeamMembers[_buyNowId];
    }

    function getAllAvailableBuyNow()
        public
        view
        returns (BuyNowConfiguration[] memory)
    {
        BuyNowConfiguration[]
            memory availableBuyNowList = new BuyNowConfiguration[](
                createdBuyNowIds.length
            );
        for (uint256 i = 0; i < createdBuyNowIds.length; i++) {
            availableBuyNowList[i] = availableBuyNowList[createdBuyNowIds[i]];
        }
        return availableBuyNowList;
    }

    function getActiveBuyNowTokenIds()
        public
        view
        returns (TokenBuyNow[] memory)
    {
        uint256 correctArraySize = 0;

        for (uint256 i = 0; i < activeBuyNowTokenIds.length; i++) {
            if (activeBuyNowTokenIds[i].tokenId != 0) {
                correctArraySize += 1;
            }
        }

        TokenBuyNow[] memory activeAuctions = new TokenBuyNow[](
            correctArraySize
        );

        uint256 correctIndex = 0;
        for (uint256 i = 0; i < activeBuyNowTokenIds.length; i++) {
            if (activeBuyNowTokenIds[i].tokenId != 0) {
                activeAuctions[correctIndex] = activeBuyNowTokenIds[i];
                correctIndex++;
            }
        }

        return activeAuctions;
    }

    function getFinishedBuyNowTokenIds()
        public
        view
        returns (TokenBuyNow[] memory)
    {
        uint256 correctArraySize = 0;

        for (uint256 i = 0; i < finishedBuyNowTokenIds.length; i++) {
            if (finishedBuyNowTokenIds[i].tokenId != 0) {
                correctArraySize += 1;
            }
        }

        TokenBuyNow[] memory finishedAuctions = new TokenBuyNow[](
            correctArraySize
        );

        uint256 correctIndex = 0;
        for (uint256 i = 0; i < finishedBuyNowTokenIds.length; i++) {
            if (finishedBuyNowTokenIds[i].tokenId != 0) {
                finishedAuctions[correctIndex] = finishedBuyNowTokenIds[i];
                correctIndex++;
            }
        }

        return finishedAuctions;
    }

    function getBatchAuctions(
        uint256[] memory _buyNowIds
    ) public view returns (BuyNowConfiguration[] memory) {
        BuyNowConfiguration[] memory batchAuctions = new BuyNowConfiguration[](
            _buyNowIds.length
        );

        for (uint256 i = 0; i < _buyNowIds.length; i++) {
            if (availableBuyNow[_buyNowIds[i]].tokenId == 0) {
                revert("One of given buyNowIds does not exist");
            } else {
                batchAuctions[i] = availableBuyNow[_buyNowIds[i]];
            }
        }

        return batchAuctions;
    }

    function saveBuyReferralFees(
        uint256 _buyNowId,
        uint256 _level1ReferralFee,
        uint256 _level2ReferralFee,
        uint256 _level3ReferralFee
    ) private {
        Referral.ReferralFees memory feesConfig = Referral.ReferralFees(
            _level1ReferralFee,
            _level2ReferralFee,
            _level3ReferralFee
        );
        buyReferralFees[_buyNowId] = feesConfig;
    }

    function saveBuyRoyaltyFees(uint256 _buyNowId, uint256 _tokenId) private {
        Royalty.RoyaltyTeamMember[] memory teamMembers = metaproRoyalty
            .getTeamMembers(
                _tokenId,
                buyAuctionTokenContractAddress[_buyNowId]
            );

        Royalty.RoyaltyTeamMember[]
            storage royaltyBuyNowFees = buyNowRoyaltyTeamMembers[_buyNowId];

        for (uint256 i = 0; i < teamMembers.length; ++i) {
            royaltyBuyNowFees.push(teamMembers[i]);
        }
    }

    function depositOnReferrer(
        uint256 _buyNowId,
        address _referrer,
        address _depositer,
        uint256 _amount,
        uint256 _referralFee,
        uint256 _tokenId,
        uint256 _level
    ) private returns (uint256) {
        uint256 referralFeeAmount = _amount.mul(_referralFee).div(10000);

        busd.transfer(_referrer, referralFeeAmount);

        metaproReferral.saveReferralDeposit(
            _referrer,
            address(this),
            _buyNowId,
            _tokenId,
            _depositer,
            _level,
            referralFeeAmount
        );
        return referralFeeAmount;
    }

    function sendFeesToReferrers(
        BuyNowConfiguration memory _buyNowConfiguration,
        Referral.ReferralFees memory _buyNowFeesConfiguration,
        uint256 _amount,
        address _depositer
    ) private returns (uint256) {
        uint256 fee = 0;
        address spacePadReferrer = metaproReferral.getReferral(_depositer);
        if (spacePadReferrer != address(0)) {
            // Level 1
            if (_buyNowFeesConfiguration.level1ReferrerFee > 0) {
                uint256 level1Fee = depositOnReferrer(
                    _buyNowConfiguration.buyNowId,
                    spacePadReferrer,
                    _depositer,
                    _amount,
                    _buyNowFeesConfiguration.level1ReferrerFee,
                    _buyNowConfiguration.tokenId,
                    1
                );

                fee += level1Fee;
            }
            // Level 2
            address level2Referrer = metaproReferral.getReferral(
                spacePadReferrer
            );
            if (level2Referrer != address(0)) {
                if (_buyNowFeesConfiguration.level2ReferrerFee > 0) {
                    uint256 level2Fee = depositOnReferrer(
                        _buyNowConfiguration.buyNowId,
                        level2Referrer,
                        _depositer,
                        _amount,
                        _buyNowFeesConfiguration.level2ReferrerFee,
                        _buyNowConfiguration.tokenId,
                        2
                    );

                    fee += level2Fee;
                }

                // Level 3
                address level3Referrer = metaproReferral.getReferral(
                    level2Referrer
                );
                if (level3Referrer != address(0)) {
                    if (_buyNowFeesConfiguration.level3ReferrerFee > 0) {
                        uint256 level3Fee = depositOnReferrer(
                            _buyNowConfiguration.buyNowId,
                            level3Referrer,
                            _depositer,
                            _amount,
                            _buyNowFeesConfiguration.level3ReferrerFee,
                            _buyNowConfiguration.tokenId,
                            3
                        );
                        fee += level3Fee;
                    }
                }
            }
        }
        return fee;
    }

    function sendFeesToRoyaltyTeamMembers(
        BuyNowConfiguration memory _buyNowConfiguration,
        uint256 _amount
    ) private returns (uint256) {
        uint256 fee = 0;
        Royalty.RoyaltyTeamMember[]
            storage royaltyMembers = buyNowRoyaltyTeamMembers[
                _buyNowConfiguration.buyNowId
            ];

        for (uint256 i = 0; i < royaltyMembers.length; i++) {
            Royalty.RoyaltyTeamMember memory member = royaltyMembers[i];
            uint256 royaltyFee = _amount.mul(member.royaltyFee).div(10000);
            busd.transfer(member.member, royaltyFee);
            fee += royaltyFee;
        }

        return fee;
    }

    function setTreasuryFee(uint256 _fee) external onlyOwner {
        require(_fee < 2500, "INS: Fee can't be greater than 2,5%; 2500");
        treasuryFee = _fee;
        emit TreasuryFeeUpdated(_fee);
    }

    function setBusdAddress(address _newAddress) external onlyOwner {
        busdAddress = _newAddress;
        busd = IERC20(_newAddress);
        emit BUSDAddressUpdated(_newAddress);
    }

    function setTressuryAddress(address _newAddress) external onlyOwner {
        tressuryAddress = _newAddress;
        emit TressuryAddressUpdated(_newAddress);
    }

    function setReferralAddress(address _newAddress) external onlyOwner {
        referralAddress = _newAddress;
        metaproReferral = MetaproReferral(_newAddress);
        emit ReferralAddressUpdated(_newAddress);
    }

    function setRoyaltyAddress(address _newAddress) external onlyOwner {
        royaltyAddress = _newAddress;
        metaproRoyalty = MetaproRoyalty(_newAddress);
        emit RoyaltyAddressUpdated(_newAddress);
    }
}
