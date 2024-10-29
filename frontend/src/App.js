import React, { useEffect, useState } from "react";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import {
  Program,
  AnchorProvider,
  web3,
  utils,
  BN,
} from "@project-serum/anchor";
import { Buffer } from "buffer";
import idl from "./idl.json";
import { AlertCircle, Wallet, Plus, RefreshCw, DollarSign, LogOut } from "lucide-react";

window.Buffer = Buffer;

const programID = new PublicKey(idl.metadata.address);
const network = clusterApiUrl("devnet");
const opts = {
  preflightCommitment: "processed",
};
const { SystemProgram } = web3;

export default function App() {
  const [walletAddress, setWalletAddress] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);

  const getProvider = () => {
    const connection = new Connection(network, {
      commitment: opts.preflightCommitment,
      confirmTransactionInitialTimeout: 60000,
    });
    const provider = new AnchorProvider(
      connection,
      window.solana,
      { commitment: opts.preflightCommitment }
    );
    return provider;
  };

  const checkIfWalletIsConnected = async () => {
    try {
      const { solana } = window;
      if (solana) {
        if (solana.isPhantom) {
          const response = await solana.connect({ onlyIfTrusted: true });
          setWalletAddress(response.publicKey.toString());
        }
      } else {
        showAlert("Phantom wallet not found! Please install Phantom wallet.");
      }
    } catch (error) {
      console.error(error);
    }
  };

  const connectWallet = async () => {
    const { solana } = window;
    if (solana) {
      try {
        setLoading(true);
        const response = await solana.connect();
        setWalletAddress(response.publicKey.toString());
      } catch (error) {
        showAlert("Failed to connect wallet: " + error.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const getCampaigns = async () => {
    try {
      setLoading(true);
      const connection = new Connection(network, opts.preflightCommitment);
      const provider = getProvider();
      const program = new Program(idl, programID, provider);
      
      const campaignAccounts = await connection.getProgramAccounts(programID);
      const campaigns = await Promise.all(
        campaignAccounts.map(async (campaign) => ({
          ...(await program.account.campaign.fetch(campaign.pubkey)),
          pubkey: campaign.pubkey,
        }))
      );
      
      setCampaigns(campaigns);
    } catch (error) {
      showAlert("Failed to fetch campaigns: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const createCampaign = async () => {
	try {
	  setLoading(true);
	  const provider = getProvider();
	  const program = new Program(idl, programID, provider);
  
	  // Get latest blockhash for transaction
	  const latestBlockhash = await provider.connection.getLatestBlockhash('confirmed');
  
	  // Calculate the campaign PDA (Program Derived Address)
	  const [campaign] = PublicKey.findProgramAddressSync(
		[
		  utils.bytes.utf8.encode("CAMPAIGN_DEMO"),
		  provider.wallet.publicKey.toBuffer()
		],
		program.programId
	  );
  
	  // Check if campaign already exists
	  const campaignAccount = await provider.connection.getAccountInfo(campaign);
	  if (campaignAccount) {
		throw new Error("Campaign already exists for this wallet");
	  }
  
	  const tx = await program.methods
		.create("Campaign Name", "Campaign Description")
		.accounts({
		  campaign: campaign,
		  user: provider.wallet.publicKey,
		  systemProgram: SystemProgram.programId,
		})
		.rpc({
		  skipPreflight: false, // Enable preflight checks
		  maxRetries: 5,
		  commitment: 'confirmed',
		  blockhash: latestBlockhash.blockhash,
		  lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
		});
  
	  // Wait for transaction confirmation
	  const confirmation = await provider.connection.confirmTransaction({
		signature: tx,
		blockhash: latestBlockhash.blockhash,
		lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
	  });
  
	  if (confirmation.value.err) {
		throw new Error("Transaction failed to confirm");
	  }
  
	  console.log("Created campaign with signature:", tx);
	  await getCampaigns();
	  showAlert("Campaign created successfully!");
	} catch (error) {
	  console.error("Error creating campaign:", error);
	  showAlert(`Failed to create campaign: ${error.message}`);
	} finally {
	  setLoading(false);
	}
  };
  const donate = async (publicKey) => {
    try {
      setLoading(true);
      const provider = getProvider();
      const program = new Program(idl, programID, provider);
      const latestBlockhash = await provider.connection.getLatestBlockhash();

      await program.methods
        .donate(new BN(0.2 * web3.LAMPORTS_PER_SOL))
        .accounts({
          campaign: publicKey,
          user: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc({
          skipPreflight: false,
          maxRetries: 3,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        });

      await getCampaigns();
      showAlert("Donation successful!");
    } catch (error) {
      console.error("Donation error:", error);
      showAlert("Failed to donate: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const withdraw = async (publicKey, adminKey) => {
	try {
	  setLoading(true);
	  const provider = getProvider();
	  const program = new Program(idl, programID, provider);
  
	  // Verify the connected wallet is the admin
	  if (provider.wallet.publicKey.toString() !== adminKey.toString()) {
		throw new Error("Only the campaign admin can withdraw funds");
	  }
  
	  // Connect to the network
	  const connection = new Connection(network, opts.preflightCommitment);
	  
	  // Get campaign account info
	  const accountInfo = await connection.getAccountInfo(publicKey);
	  if (!accountInfo) {
		throw new Error("Campaign account not found");
	  }
  
	  // Fetch current campaign data
	  const campaign = await program.account.campaign.fetch(publicKey);
	  
	  // Calculate the rent exempt amount needed
	  const rentExempt = await connection.getMinimumBalanceForRentExemption(
		accountInfo.data.length
	  );
  
	  // Calculate maximum withdrawable amount
	  const currentBalance = accountInfo.lamports;
	  const maxWithdraw = currentBalance - rentExempt;
	  
	  // Set withdraw amount (smaller of maxWithdraw or 0.2 SOL)
	  const withdrawAmount = Math.min(
		maxWithdraw,
		0.2 * web3.LAMPORTS_PER_SOL
	  );
  
	  if (withdrawAmount <= 0) {
		throw new Error("Insufficient funds available for withdrawal after rent-exempt reserve");
	  }
  
	  // Get latest blockhash
	  const latestBlockhash = await provider.connection.getLatestBlockhash();
  
	  // Execute withdrawal
	  const tx = await program.methods
		.withdraw(new BN(withdrawAmount))
		.accounts({
		  campaign: publicKey,
		  user: provider.wallet.publicKey,
		})
		.rpc({
		  skipPreflight: false,
		  maxRetries: 3,
		  blockhash: latestBlockhash.blockhash,
		  lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
		});
  
	  // Wait for confirmation
	  await connection.confirmTransaction({
		blockhash: latestBlockhash.blockhash,
		lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
		signature: tx
	  });
  
	  await getCampaigns();
	  showAlert(`Successfully withdrew ${withdrawAmount / web3.LAMPORTS_PER_SOL} SOL`);
  
	} catch (error) {
	  console.error("Withdrawal error:", error);
	  showAlert(error.message);
	} finally {
	  setLoading(false);
	}
  };

  const showAlert = (message) => {
    alert(message);
  };

  useEffect(() => {
    checkIfWalletIsConnected();
  }, []);

  useEffect(() => {
    if (walletAddress) {
      getCampaigns();
    }
  }, [walletAddress]);

  if (!walletAddress) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Crowdfunding DApp</h1>
            <p className="text-gray-600">Connect your Phantom wallet to get started</p>
          </div>
          <button
            onClick={connectWallet}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-purple-600 text-white rounded-lg py-3 px-4 hover:bg-purple-700 transition-colors disabled:opacity-50"
          >
            {loading ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <Wallet className="w-5 h-5" />
            )}
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Crowdfunding Campaigns</h1>
          <div className="flex gap-2">
            <button
              onClick={createCampaign}
              disabled={loading}
              className="flex items-center gap-2 bg-purple-600 text-white rounded-lg py-2 px-4 hover:bg-purple-700 transition-colors disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Create Campaign
            </button>
            <button
              onClick={getCampaigns}
              disabled={loading}
              className="flex items-center gap-2 bg-blue-600 text-white rounded-lg py-2 px-4 hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {campaigns.map((campaign) => (
            <div
              key={campaign.pubkey.toString()}
              className="bg-white rounded-lg shadow-md p-6"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">{campaign.name}</h2>
                  <p className="text-gray-600 text-sm mb-2">{campaign.description}</p>
                </div>
                <div className="bg-purple-100 rounded-full px-3 py-1">
                  <p className="text-purple-700 text-sm font-medium">
                    {(campaign.amountDonated / web3.LAMPORTS_PER_SOL).toFixed(2)} SOL
                  </p>
                </div>
              </div>
              
              <div className="text-xs text-gray-500 font-mono mb-2">
                ID: {campaign.pubkey.toString()}
              </div>
              <div className="text-xs text-gray-500 font-mono mb-4">
                Admin: {campaign.admin.toString()}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => donate(campaign.pubkey)}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white rounded-lg py-2 px-4 hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  <DollarSign className="w-4 h-4" />
                  Donate
                </button>
                {campaign.admin.toString() === walletAddress && (
                  <button
                    onClick={() => withdraw(campaign.pubkey, campaign.admin)}
                    disabled={loading}
                    className="flex-1 flex items-center justify-center gap-2 bg-orange-600 text-white rounded-lg py-2 px-4 hover:bg-orange-700 transition-colors disabled:opacity-50"
                  >
                    <LogOut className="w-4 h-4" />
                    Withdraw
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {campaigns.length === 0 && !loading && (
          <div className="text-center py-12">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No campaigns found. Create one to get started!</p>
          </div>
        )}
      </div>
    </div>
  );
}