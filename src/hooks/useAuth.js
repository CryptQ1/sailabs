import { useState } from 'react';

export default function useAuth() {
  const [isConnected, setIsConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState(null);
  const [connectedWallet, setConnectedWallet] = useState(null);

  async function connectAndSignWallet() {
    try {
      let provider;
      if (window.solana && window.solana.isPhantom) provider = window.solana;
      else if (window.backpack) provider = window.backpack;
      else {
        alert('Vui lòng cài đặt ví Phantom hoặc Backpack!');
        return;
      }

      await provider.connect();
      setConnectedWallet(provider);
      const publicKey = provider.publicKey.toString();
      // ... (sao chép logic từ dashboard.html)
      setIsConnected(true);
      setWalletAddress(publicKey);
    } catch (error) {
      console.error('Error connecting wallet:', error);
    }
  }

  function logout() {
    if (connectedWallet) connectedWallet.disconnect();
    setConnectedWallet(null);
    setIsConnected(false);
    setWalletAddress(null);
  }

  return { isConnected, walletAddress, connectAndSignWallet, logout };
}