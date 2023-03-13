// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MetaproReferral is Ownable {
    using SafeMath for uint256;

    struct ReferralDeposits {
        address contractAddress;
        uint256 auctionId;
        uint256 tokenId;
        address depositer;
        uint256 level;
        uint256 provision;
    }

    struct ReferralEearnings {
        uint256 all;
        uint256 level1;
        uint256 level2;
        uint256 level3;
    }

    struct ReferralStructure {
        address uplineReferrer;
        address[] level1;
        address[] level2;
        address[] level3;
    }

    mapping(address => uint256) public referredCount; // referrer_address -> num_of_referred

    mapping(address => address) private activeReferral;

    mapping(address => mapping(address => ReferralDeposits[]))
        private referralContractDeposits;

    mapping(address => ReferralDeposits[]) private referralDeposits;

    mapping(address => ReferralStructure) public referralStructure;

    mapping(address => mapping(address => ReferralEearnings))
        private referralContractEarnings;

    mapping(address => ReferralEearnings) private referralEarnings;

    event SetReferral(address indexed referrer, address indexed referred);
    event ReferralDeposit(
        address indexed referrer,
        address contractAddress,
        uint256 indexed auctionId,
        uint256 tokenId,
        address depositer,
        uint256 level,
        uint256 indexed provision
    );
    event NextOwnerApproved(address indexed _owner);
    event AdminStatus(address indexed _admin, bool _status);

    mapping(address => bool) public isAdmin;

    modifier onlyAdmin() {
        require(isAdmin[msg.sender], "OnlyAdmin methods called by non-admin.");
        _;
    }

    function saveReferralDeposit(
        address _referrer,
        address _contractAddress,
        uint256 _auctionId,
        uint256 _tokenId,
        address _depositer,
        uint256 _level,
        uint256 _provision
    ) external {
        ReferralDeposits memory referralDeposit = ReferralDeposits(
            _contractAddress,
            _auctionId,
            _tokenId,
            _depositer,
            _level,
            _provision
        );

        ReferralStructure storage refStructure = referralStructure[_referrer];

        // Add the referral address to the appropriate level array
        if (
            _level == 1 &&
            !checkIfDepositerExists(refStructure.level1, _depositer)
        ) {
            refStructure.level1.push(_depositer);
        } else if (
            _level == 2 &&
            !checkIfDepositerExists(refStructure.level2, _depositer)
        ) {
            refStructure.level2.push(_depositer);
        } else if (
            _level == 3 &&
            !checkIfDepositerExists(refStructure.level3, _depositer)
        ) {
            refStructure.level3.push(_depositer);
        }

        setReferralEarnings(_referrer, _provision, _contractAddress, _level);

        referralDeposits[_referrer].push(referralDeposit);
        referralContractDeposits[_contractAddress][_referrer].push(
            referralDeposit
        );

        emit ReferralDeposit(
            _referrer,
            _contractAddress,
            _auctionId,
            _tokenId,
            _depositer,
            _level,
            _provision
        );
    }

    function checkIfDepositerExists(
        address[] storage _levelDepositers,
        address _depositer
    ) private view returns (bool) {
        // Loop through the array and check each element
        for (uint256 i = 0; i < _levelDepositers.length; i++) {
            if (_levelDepositers[i] == _depositer) {
                return true;
            }
        }
        return false;
    }

    function setReferralEarnings(
        address _referrer,
        uint256 _provision,
        address _contractAddress,
        uint256 _level
    ) private {
        ReferralEearnings storage contractEarnings = referralContractEarnings[
            _contractAddress
        ][_referrer];

        ReferralEearnings storage earnings = referralEarnings[_referrer];

        contractEarnings.all += _provision;
        earnings.all += _provision;
        if (_level == 1) {
            contractEarnings.level1 += _provision;
            earnings.level1 += _provision;
        }
        if (_level == 2) {
            contractEarnings.level2 += _provision;
            earnings.level2 += _provision;
        }
        if (_level == 3) {
            contractEarnings.level3 += _provision;
            earnings.level3 += _provision;
        }
    }

    function getReferralStructure(address _refferal)
        public
        view
        returns (
            address uplineReferrer,
            address[] memory level1,
            address[] memory level2,
            address[] memory level3
        )
    {
        ReferralStructure storage referralStruct = referralStructure[_refferal];
        return (
            referralStruct.uplineReferrer,
            referralStruct.level1,
            referralStruct.level2,
            referralStruct.level3
        );
    }

    function getReferralContractEearnings(
        address _referralAddress,
        address _contractAddress
    )
        public
        view
        returns (
            uint256 all,
            uint256 level1,
            uint256 level2,
            uint256 level3
        )
    {
        ReferralEearnings storage earnigns = referralContractEarnings[
            _contractAddress
        ][_referralAddress];
        return (
            earnigns.all,
            earnigns.level1,
            earnigns.level2,
            earnigns.level3
        );
    }

    function getReferralEearnings(address _referralAddress)
        public
        view
        returns (
            uint256 all,
            uint256 level1,
            uint256 level2,
            uint256 level3
        )
    {
        ReferralEearnings storage earnigns = referralEarnings[_referralAddress];
        return (
            earnigns.all,
            earnigns.level1,
            earnigns.level2,
            earnigns.level3
        );
    }

    function getReferralContractDeposits(
        address _referralAddress,
        address _contractAddress
    ) public view returns (ReferralDeposits[] memory) {
        return referralContractDeposits[_contractAddress][_referralAddress];
    }

    function getReferralDeposits(address _referralAddress)
        public
        view
        returns (ReferralDeposits[] memory)
    {
        return referralDeposits[_referralAddress];
    }

    function setReferral(address _referred, address _referrer)
        external
        onlyAdmin
    {
        if (
            activeReferral[_referred] == address(0) && _referrer != address(0)
        ) {
            referralStructure[_referred].uplineReferrer = _referrer;
            activeReferral[_referred] = _referrer;
            referredCount[_referrer] += 1;
            emit SetReferral(_referrer, _referred);
        }
    }

    function setReferralStructure(
        address _referrer,
        address _uplineReferrer,
        address[] memory _level1Referred,
        address[] memory _level2Referred,
        address[] memory _level3Referred
    ) external onlyOwner {
        ReferralStructure storage currentReferrer = referralStructure[
            _referrer
        ];

        currentReferrer.uplineReferrer = _uplineReferrer;
        for (uint256 i = 0; i < _level1Referred.length; i++) {
            if (
                !checkIfDepositerExists(
                    currentReferrer.level1,
                    _level1Referred[i]
                )
            ) {
                currentReferrer.level1.push(_level1Referred[i]);
            }
        }
        for (uint256 i = 0; i < _level2Referred.length; i++) {
            if (
                !checkIfDepositerExists(
                    currentReferrer.level2,
                    _level2Referred[i]
                )
            ) {
                currentReferrer.level2.push(_level2Referred[i]);
            }
        }
        for (uint256 i = 0; i < _level3Referred.length; i++) {
            if (
                !checkIfDepositerExists(
                    currentReferrer.level3,
                    _level3Referred[i]
                )
            ) {
                currentReferrer.level3.push(_level3Referred[i]);
            }
        }
    }

    function setMyReferral(address _referred) public {
        require(
            activeReferral[_referred] == address(0),
            "Wallet has already assigned referral"
        );

        referralStructure[_referred].uplineReferrer = msg.sender;
        activeReferral[_referred] = msg.sender;
        referredCount[msg.sender] += 1;
        emit SetReferral(msg.sender, _referred);
    }

    function setMyReferrals(address[] memory _referred) public {
        for (uint256 i = 0; i < _referred.length; i++) {
            require(
                activeReferral[_referred[i]] == address(0),
                "One of wallets has already assigned referral"
            );
            referralStructure[_referred[i]].uplineReferrer = msg.sender;
            activeReferral[_referred[i]] = msg.sender;
            referredCount[msg.sender] += _referred.length;
            emit SetReferral(msg.sender, _referred[i]);
        }
    }

    function getReferral(address _referred) external view returns (address) {
        return activeReferral[_referred];
    }

    // Set admin status.
    function setAdminStatus(address _admin, bool _status) external onlyOwner {
        require(_admin != address(0), "Admin: admin address cannot be null");
        isAdmin[_admin] = _status;

        emit AdminStatus(_admin, _status);
    }
}
