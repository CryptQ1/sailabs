// pages/dashboard.js

import Head from 'next/head';
import dynamic from 'next/dynamic';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import '../styles/dashboard.css';
import { io } from 'socket.io-client';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import Image from 'next/image';
import * as THREE from 'three';
import { PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction } from '@solana/web3.js';

// Import Chart.js components
const Bar = dynamic(() => import('react-chartjs-2').then((mod) => mod.Bar), { ssr: false });
const ParticleEffect = dynamic(() => import('../components/ParticleEffect'), { ssr: false });
import { Chart, LinearScale, CategoryScale, BarElement, Tooltip, Legend } from 'chart.js';

Chart.register(LinearScale, CategoryScale, BarElement, Tooltip, Legend);

export default function Dashboard() {
  const { publicKey, signMessage, signTransaction, connect, disconnect, connected } = useWallet();
  const { connection } = useConnection();
  const [isConnected, setIsConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [connectedWallet, setConnectedWallet] = useState(null);
  const [referralsCount, setReferralsCount] = useState(0);
  const [currentTier, setCurrentTier] = useState('None');
  const [isNodeConnected, setIsNodeConnected] = useState(false);
  const [jwt, setJwt] = useState(null);
  const [activeTab, setActiveTab] = useState('profile');
  const [lastSignedTime, setLastSignedTime] = useState(null);
  const [totalPoints, setTotalPoints] = useState(0);
  const [todayPoints, setTodayPoints] = useState(0);
  const [hoursToday, setHoursToday] = useState(0);
  const [daysSeason1, setDaysSeason1] = useState(0);
  const [networkStrength, setNetworkStrength] = useState(0);
  const [referralCode, setReferralCode] = useState('');
  const [referralLink, setReferralLink] = useState('');
  const [referralRanking, setReferralRanking] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [referralPage, setReferralPage] = useState(1);
  const [leaderboardPage, setLeaderboardPage] = useState(1);
  const [referralSearch, setReferralSearch] = useState('');
  const [leaderboardSearch, setLeaderboardSearch] = useState('');
  const [dailyPoints, setDailyPoints] = useState(Array(14).fill(0));
  const [referralCodeInput, setReferralCodeInput] = useState(['', '', '', '', '', '']);
  const [showReferralInput, setShowReferralInput] = useState(true);
  const [referralError, setReferralError] = useState('');
  const [solanaConnected, setSolanaConnected] = useState(false);
  const [error, setError] = useState('');
  const [isSigning, setIsSigning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const signedRef = useRef(false);
  const socketRef = useRef(null);
  const inputRefs = useRef([]);
  const [isDiscordLinked, setIsDiscordLinked] = useState(false);
  const [isDiscordLoading, setIsDiscordLoading] = useState(false);
  const [discordError, setDiscordError] = useState('');
  const [discordAvatar, setDiscordAvatar] = useState('');
  const [discordUsername, setDiscordUsername] = useState('');

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api';
  const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000';
  const itemsPerPage = 5;

  const tabs = [
    { id: 'profile', label: 'Profile' },
    { id: 'nodes', label: 'Nodes' },
    { id: 'referrals', label: 'Referrals' },
    { id: 'leaderboard', label: 'Leaderboard' },
  ];

  // Send SOL to program
  const sendSolToProgram = useCallback(async () => {
    if (!publicKey || !signTransaction || !connection) {
      throw new Error('Wallet not connected or transaction signing not supported');
    }
    setIsLoading(true);
    try {
      // Thay Program ID bằng địa chỉ ví đích (PDA hoặc ví khác)
      // TODO: Thay bằng địa chỉ ví hợp lệ hoặc PDA của chương trình
      const destinationAddress = new PublicKey('B26dnbBzXhj1rwT13ab4YMBDbf9qvUHxw5h3SHpJ9nYF'); // Thay bằng địa chỉ ví đích
      const amount = 0.001 * LAMPORTS_PER_SOL; // 0.1 SOL

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: destinationAddress,
          lamports: amount,
        })
      );

      const latestBlockhash = await connection.getLatestBlockhash();
      transaction.recentBlockhash = latestBlockhash.blockhash;
      transaction.feePayer = publicKey;

      const signedTransaction = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTransaction.serialize());
      await connection.confirmTransaction({ signature, ...latestBlockhash });

      console.log('Sent 0.1 SOL to destination:', signature);
      return signature;
    } catch (error) {
      console.error('Error sending SOL:', error);
      setError('Failed to send SOL: ' + (error.message || 'Transaction failed'));
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, signTransaction, connection]);

  // Toggle node connection
  const toggleNodeConnection = useCallback(async () => {
    if (!connectedWallet || !publicKey || !signMessage || !signTransaction) {
      console.error('No wallet connected');
      setError('Please connect a Solana wallet to toggle node connection');
      return;
    }

    const publicKeyStr = publicKey.toString();
    if (!isNodeConnected) {
      setIsSigning(true);
      try {
        const message = 'Sign to activate S.AI Node connection';
        const encodedMessage = new TextEncoder().encode(message);
        const signed = await signMessage(encodedMessage);
        const signatureBase64 = btoa(String.fromCharCode(...signed));

        await sendSolToProgram();

        const response = await fetch(`${API_BASE_URL}/auth/sign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            publicKey: publicKeyStr,
            signature: signatureBase64,
            nodeConnection: true,
          }),
        });
        const result = await response.json();

        if (result.token) {
          setJwtToken(result.token);
          setIsNodeConnected(true);
          setNetworkStrength(4);
          if (socketRef.current) {
            socketRef.current.emit('node-connect', publicKeyStr);
          }
        } else {
          throw new Error(result.error || 'Node connection authentication failed');
        }
      } catch (error) {
        console.error('Error activating node:', error);
        setError('Failed to activate node');
      } finally {
        setIsSigning(false);
      }
    } else {
      setIsNodeConnected(false);
      setNetworkStrength(0);
      if (socketRef.current) {
        socketRef.current.emit('node-disconnect');
      }
    }
  }, [
    connectedWallet,
    publicKey,
    signMessage,
    signTransaction,
    isNodeConnected,
    sendSolToProgram,
    API_BASE_URL,
  ]);

  // Utility functions
  const checkStorageAccess = useCallback(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('test', 'test');
        localStorage.removeItem('test');
        return true;
      }
      return false;
    } catch (e) {
      console.error('Storage access error:', e);
      return false;
    }
  }, []);

  const setJwtToken = useCallback((token) => {
    if (checkStorageAccess()) {
      try {
        localStorage.setItem('jwt', token);
      } catch (e) {
        console.error('Failed to set JWT in localStorage:', e);
        setJwt(token);
      }
    } else {
      setJwt(token);
    }
  }, [checkStorageAccess]);

  const getJwt = useCallback(() => {
    if (checkStorageAccess()) {
      try {
        return localStorage.getItem('jwt');
      } catch (e) {
        console.error('Failed to get JWT from localStorage:', e);
        return jwt;
      }
    }
    return jwt;
  }, [checkStorageAccess, jwt]);

  const fetchWithAuth = useCallback(async (endpoint, method = 'GET', body = null, retries = 3) => {
    const token = getJwt();
    if (!token) {
      console.error('No JWT token for endpoint:', endpoint);
      setError('Please log in again');
      return null;
    }
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        if (response.status === 401) {
          console.error('Unauthorized error for', endpoint);
          setError('Your session has expired. Please log in again.');
          setJwt(null);
          if (checkStorageAccess()) localStorage.removeItem('jwt');
          setIsConnected(false);
          return null;
        }
        if (response.status === 400) {
          console.error('Invalid request for', endpoint);
          const errorData = await response.json();
          return errorData;
        }
        if (response.status === 403) {
          console.error('Access denied error for', endpoint);
          setError('Access denied. Please try again.');
          return null;
        }
        if (!response.ok) {
          console.error('HTTP error for', endpoint, ': Status', response.status);
          throw new Error(`HTTP error ${response.status} for ${endpoint}`);
        }
        return await response.json();
      } catch (error) {
        console.error('Attempt', i + 1, 'failed for', endpoint, ':', error.message);
        if (i === retries - 1) {
          setError('Server connection error. Please try again.');
          return null;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }, [getJwt, checkStorageAccess, API_BASE_URL]);

  const savePointsToDB = useCallback(async (wallet, date, points) => {
    try {
      const response = await fetchWithAuth('/save-points', 'POST', {
        wallet,
        date,
        points,
      });
      if (!response.success) {
        throw new Error('Failed to save points');
      }
    } catch (error) {
      console.error('Error saving points to DB:', error);
    }
  }, [fetchWithAuth]);

  const fetchReferralInfo = useCallback(async (publicKey) => {
    try {
      const info = await fetchWithAuth(`/referrals/info?publicKey=${publicKey}`);
      setReferralCode(info.code || '');
      setReferralLink(info.link || '');
      setReferralsCount(info.referralsCount || 0);
    } catch (error) {
      console.error('Error fetching referral info:', error);
    }
  }, [fetchWithAuth]);

  const fetchReferralRanking = useCallback(async () => {
    try {
      const data = await fetchWithAuth('/referrals/ranking');
      if (Array.isArray(data)) {
        setReferralRanking(data);
      } else {
        console.warn('Referral ranking is not an array:', data);
        setReferralRanking([]);
      }
    } catch (error) {
      console.error('Error fetching referral ranking:', error);
      setReferralRanking([]);
    }
  }, [fetchWithAuth]);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const data = await fetchWithAuth('/leaderboard');
      if (Array.isArray(data)) {
        setLeaderboard(data);
      } else {
        setLeaderboard([]);
      }
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      setLeaderboard([]);
    }
  }, [fetchWithAuth]);

  const fetchUserStats = useCallback(async () => {
    try {
      const stats = await fetchWithAuth('/user-stats');
      if (stats) {
        setTotalPoints(stats.totalPoints || 0);
        setTodayPoints(stats.todayPoints || 0);
        setHoursToday(stats.hoursToday || 0);
        setDaysSeason1(stats.daysSeason1 || 0);
        setReferralsCount(stats.referralsCount || 0);
        setCurrentTier(stats.currentTier || 'None');
        setNetworkStrength(stats.networkStrength || 0);
        setIsNodeConnected(stats.networkStrength > 0);
        setDailyPoints(stats.dailyPoints || Array(14).fill(0));

        const today = new Date();
        const todayStr = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;
        if (walletAddress) {
          await savePointsToDB(walletAddress, todayStr, stats.todayPoints || 0);
        }
      }
    } catch (error) {
      console.error('Error fetching user stats:', error);
      setTotalPoints(0);
      setTodayPoints(0);
      setHoursToday(0);
      setDaysSeason1(0);
      setReferralsCount(0);
      setCurrentTier('None');
      setNetworkStrength(0);
      setIsNodeConnected(false);
      setDailyPoints(Array(14).fill(0));
    }
  }, [walletAddress, savePointsToDB, fetchWithAuth]);

  const canSignWallet = useCallback(() => {
    if (!lastSignedTime) return true;
    const now = Date.now();
    const hoursSinceLastSign = (now - lastSignedTime) / (1000 * 60 * 60);
    return hoursSinceLastSign >= 24;
  }, [lastSignedTime]);

  const connectAndSignWallet = useCallback(async () => {
    if (isConnected || isSigning || !canSignWallet() || signedRef.current) {
      console.log('Cannot sign wallet: already connected or signing');
      return;
    }

    setIsSigning(true);
    setError('');

    try {
      if (!connected) {
        console.log('Connecting wallet...');
        await connect();
      }

      if (!publicKey || !signMessage) {
        throw new Error('Wallet not connected or does not support message signing');
      }

      const publicKeyStr = publicKey.toString();
      const message = 'Sign this message to verify your wallet';
      const encodedMessage = new TextEncoder().encode(message);

      let signed;
      try {
        console.log('Requesting wallet signature...');
        signed = await signMessage(encodedMessage);
      } catch (error) {
        console.error('Error signing message:', error);
        await disconnect().catch((err) => console.error('Error disconnecting wallet:', err));
        setError('User cancelled wallet signing');
        setIsConnected(false);
        setWalletAddress('');
        setConnectedWallet(null);
        setSolanaConnected(false);
        signedRef.current = false;
        setJwt(null);
        if (checkStorageAccess()) localStorage.removeItem('jwt');
        return;
      }

      const signatureBase64 = btoa(String.fromCharCode(...signed));

      console.log('Sending signature to server...');
      const response = await fetch(`${API_BASE_URL}/auth/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicKey: publicKeyStr,
          signature: signatureBase64,
          referralCode: referralCodeInput.join('') || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Server error:', errorData);
        setError(errorData.error || 'Unable to verify wallet. Please try again.');
        setIsSigning(false);
        return;
      }

      const result = await response.json();

      if (result.token) {
        setJwtToken(result.token);
        setIsConnected(true);
        setWalletAddress(publicKeyStr);
        setConnectedWallet({ publicKey });
        setSolanaConnected(true);
        setLastSignedTime(Date.now());
        signedRef.current = true;
        if (socketRef.current) socketRef.current.emit('join', publicKeyStr);
        fetchReferralInfo(publicKeyStr);
        fetchReferralRanking();
        fetchLeaderboard();
        fetchUserStats();
        console.log('Wallet signed successfully, connected:', publicKeyStr);
      } else {
        throw new Error(result.error || 'Authentication failed');
      }
    } catch (error) {
      console.error('Error connecting or signing wallet:', error);
      setError(error.message || 'Authentication failed. Please try again.');
      await disconnect().catch((err) => console.error('Error disconnecting wallet:', err));
      setIsConnected(false);
      setWalletAddress('');
      setConnectedWallet(null);
      setSolanaConnected(false);
      signedRef.current = false;
      setJwt(null);
      if (checkStorageAccess()) localStorage.removeItem('jwt');
    } finally {
      setIsSigning(false);
    }
  }, [
    isConnected,
    isSigning,
    canSignWallet,
    connected,
    connect,
    disconnect,
    publicKey,
    signMessage,
    referralCodeInput,
    setJwtToken,
    fetchReferralInfo,
    fetchReferralRanking,
    fetchLeaderboard,
    fetchUserStats,
    checkStorageAccess,
    API_BASE_URL,
  ]);

  // Auto-sign after wallet connection
  useEffect(() => {
    if (connected && publicKey && !isConnected && !isSigning) {
      connectAndSignWallet();
    }
  }, [connected, publicKey, isConnected, isSigning, connectAndSignWallet]);

  const disconnectSolana = useCallback(async () => {
    try {
      await disconnect();
      setSolanaConnected(false);
      setIsConnected(false);
      setWalletAddress('');
      setConnectedWallet(null);
      signedRef.current = false;
    } catch (err) {
      setError('Failed to disconnect Solana wallet');
    }
  }, [disconnect]);

  const logout = useCallback(() => {
    localStorage.removeItem('jwt');
    setJwt(null);
    setIsConnected(false);
    setWalletAddress('');
    setConnectedWallet(null);
    setIsDiscordLinked(false);
    setError('');
    if (disconnect) disconnect();
  }, [disconnect]);

  const linkDiscord = useCallback(async () => {
    if (!isConnected) {
      setDiscordError('Please connect a Solana wallet before linking Discord');
      return;
    }

    setIsDiscordLoading(true);
    setDiscordError('');

    try {
      const response = await fetchWithAuth('/discord/login', 'GET');
      if (response && response.oauthUrl) {
        window.location.href = response.oauthUrl;
      } else {
        throw new Error('Unable to retrieve Discord OAuth URL');
      }
    } catch (err) {
      console.error('Error initiating Discord OAuth:', err);
      setDiscordError('Error connecting to Discord. Please try again.');
    } finally {
      setIsDiscordLoading(false);
    }
  }, [isConnected, fetchWithAuth]);

  const disconnectDiscord = useCallback(async () => {
    setIsDiscordLoading(true);
    setError('');
    setDiscordError('');
    setDiscordUsername('');
    setDiscordAvatar('');

    try {
      const response = await fetchWithAuth('/discord/disconnect', 'POST');
      if (response && response.success) {
        setIsDiscordLinked(false);
        setDiscordError('');
        setDiscordUsername('');
        setDiscordAvatar('');
        alert('Discord account disconnected successfully!');
      } else {
        throw new Error('Unable to disconnect Discord');
      }
    } catch (err) {
      console.error('Error disconnecting Discord:', err);
      setDiscordError('Error disconnecting Discord. Please try again.');
    } finally {
      setIsDiscordLoading(false);
    }
  }, [fetchWithAuth]);

  const reloadRole = useCallback(async () => {
    setIsDiscordLoading(true);
    setError('');

    try {
      const response = await fetchWithAuth('/discord/reload-role', 'POST');
      if (response && response.success) {
        alert('Discord role synchronized successfully!');
      } else {
        throw new Error('Unable to synchronize Discord role');
      }
    } catch (err) {
      console.error('Error reloading Discord role:', err);
      setError('Error synchronizing Discord role. Please try again.');
    } finally {
      setIsDiscordLoading(false);
    }
  }, [fetchWithAuth]);

  const copyText = useCallback((text) => {
    navigator.clipboard.writeText(text).then(() => {
      alert(`Copied: ${text}`);
    });
  }, []);

  const shareReferral = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join S.AI',
          text: 'Join S.AI using my referral link!',
          url: referralLink,
        });
      } catch (err) {
        console.error('Error sharing referral:', err);
      }
    } else {
      alert('Sharing not supported. Please copy the link.');
    }
  }, [referralLink]);

  const handleReferralInputChange = useCallback((index, value) => {
    if (value.length > 1) return;
    const newInput = [...referralCodeInput];
    newInput[index] = value.toUpperCase();
    setReferralCodeInput(newInput);
    setReferralError('');

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }, [referralCodeInput]);

  const handleReferralKeyDown = useCallback((index, e) => {
    if (e.key === 'Backspace' && !referralCodeInput[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }, [referralCodeInput]);

  const handleReferralSubmit = useCallback(async () => {
    const code = referralCodeInput.join('');
    if (code.length === 0) {
      setShowReferralInput(false);
      setReferralError('');
      return;
    }
    if (code.length !== 6) {
      setReferralError('Invalid referral code! Please enter a 6-character code.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/referrals/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referralCode: code }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setReferralError(errorData.error || 'Error validating referral code.');
        return;
      }

      const result = await response.json();
      if (result.success) {
        setShowReferralInput(false);
        setReferralError('');
      } else {
        setReferralError('Invalid or already used referral code.');
      }
    } catch (error) {
      console.error('Referral code validation error:', error);
      setReferralError('Server connection error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [referralCodeInput, API_BASE_URL]);

  const handleReferralSkip = useCallback(() => {
    setReferralCodeInput(['', '', '', '', '', '']);
    setShowReferralInput(false);
    setReferralError('');
  }, []);

  const generateChartLabels = useCallback(() => {
    const labels = [];
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      labels.push(`${day}/${month}/${year}`);
    }
    return labels;
  }, []);

  const chartData = useMemo(() => ({
    labels: generateChartLabels(),
    datasets: [
      {
        label: 'Daily Points',
        data: dailyPoints,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        borderColor: '#fff',
        borderWidth: 1,
        barThickness: 10,
      },
    ],
  }), [dailyPoints, generateChartLabels]);

  const chartOptions = {
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true,
        title: { display: true, text: 'Points', color: '#fff', font: { size: 12 } },
        ticks: { color: '#e0e0e0', font: { size: 10 } },
        grid: { color: 'rgba(255, 255, 255, 0.1)' },
      },
      x: {
        title: { display: true, text: 'Days', color: '#fff', font: { size: 12 } },
        ticks: { color: '#e0e0e0', font: { size: 10 } },
        grid: { color: 'rgba(255, 255, 255, 0.1)' },
      },
    },
    plugins: {
      legend: { labels: { color: '#fff', font: { size: 10 } } },
    },
  };

  const renderTabs = useCallback(() => (
    <div className="tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => setActiveTab(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  ), [activeTab]);

  const renderContent = useCallback(() => {
    switch (activeTab) {
      case 'profile':
        return (
          <div className="tab-content active">
            <h2>Profile</h2>
            {error && !isLoading && <div className="error-message">{error}</div>}
            <div className="profile-cards">
              <div className="profile-card">
                <h3>Current Tier</h3>
                <div className="card-content">
                  <div className="tier-image">
                    <img
                      src={`/${currentTier.toLowerCase().replace(' ', '')}.png`}
                      alt={`${currentTier} logo`}
                      onError={(e) => (e.target.src = '/none.png')}
                    />
                  </div>
                </div>
              </div>
              <div className="profile-card">
                <h3>Total Season 1 Points</h3>
                <div className="card-content">
                  <span className="card-value">{totalPoints}</span>
                </div>
              </div>
              <div className="profile-card">
                <h3>Today's Points</h3>
                <div className="card-content">
                  <span className="card-value">{todayPoints}</span>
                </div>
              </div>
            </div>
            <div className="social-tables">
              <div className="social-table solana">
                <h3>Solana Wallet</h3>
                {solanaConnected ? (
                  <div className="social-content">
                    <span className="social-status">Connected</span>
                    <span className="social-handle">
                      {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
                    </span>
                    <button onClick={disconnectSolana} className="disconnect-button">
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <WalletMultiButton />
                )}
              </div>
              <div className="social-table discord">
                <h3>Discord Account</h3>
                {isDiscordLinked ? (
                  <div className="social-content">
                    <span className="social-status">Linked</span>
                    <div className="social-handle">
                      {discordUsername ? (
                        <div className="discord-user">
                          {discordAvatar && (
                            <img src={discordAvatar} alt="Discord avatar" className="discord-avatar" />
                          )}
                          Connected as {discordUsername}
                        </div>
                      ) : (
                        'Connected to Discord'
                      )}
                    </div>
                    <div className="discord-actions">
                      <button
                        onClick={disconnectDiscord}
                        className="disconnect-discord-button"
                        Antarafacial
                        disabled={isDiscordLoading}
                      >
                        {isDiscordLoading ? 'Disconnecting...' : 'Disconnect'}
                      </button>
                      <button
                        onClick={reloadRole}
                        className="reload-role-button"
                        disabled={isDiscordLoading}
                      >
                        {isDiscordLoading ? 'Reloading...' : 'Reload Role'}
                      </button>
                    </div>
                    {discordError && <div className="error-message">{discordError}</div>}
                  </div>
                ) : (
                  <div className="social-content">
                    <a
                      href="https://discord.gg/CGrERSJpvw"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="discord-join-link"
                    >
                      Join <img src="/discord.png" alt="Discord logo" className="discord-logo" /> S.AI official Discord
                    </a>
                    <button
                      onClick={linkDiscord}
                      className="link-discord-button"
                      disabled={isDiscordLoading || !isConnected}
                    >
                      {isDiscordLoading ? 'Connecting...' : 'Connect to get roles'}
                    </button>
                    {discordError && <div className="error-message">{discordError}</div>}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      case 'nodes':
        return (
          <div className="tab-content active">
            <h2>Nodes</h2>
            {error && !isLoading && <div className="error-message">{error}</div>}
            <div className="nodes-container">
              <div className="chart-container">
                <Bar data={chartData} options={chartOptions} />
              </div>
              <div className="nodes-tables">
                <div className="points-table">
                  <h3>Points Summary</h3>
                  <div className="summary-content">
                    <span className="summary-label">Total Season 1 Points:</span>
                    <span className="stat-box">{totalPoints}</span>
                    <span className="summary-label">Today's Points:</span>
                    <span className="stat-box">{todayPoints}</span>
                  </div>
                </div>
                <div className="connection-table">
                  <h3>Connection Summary</h3>
                  <div className="summary-content">
                    <span className="summary-label">Total Hours Today:</span>
                    <span className="stat-box">{hoursToday.toFixed(2)}</span>
                    <span className="summary-label">Total Days Season 1:</span>
                    <span className="stat-box">{daysSeason1}</span>
                  </div>
                </div>
                <div className="connect-table">
                  <h3>Node Status</h3>
                  <div className="connect-status">{isNodeConnected ? 'Connected' : 'Disconnected'}</div>
                  <div className="network-icon">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className={`network-bar ${i <= networkStrength ? 'active' : ''}`}></div>
                    ))}
                  </div>
                  <div className="network-text">
                    Network Status: {networkStrength > 0 ? `Connected (${networkStrength}/4)` : 'Disconnected'}
                  </div>
                  <button
                    className={`connect-button ${isNodeConnected ? 'disconnect' : 'connect'}`}
                    onClick={toggleNodeConnection}
                    disabled={isSigning || isLoading}
                  >
                    {isSigning || isLoading ? 'Processing...' : isNodeConnected ? 'Disconnect' : 'Connect'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      case 'referrals':
        return (
          <div className="tab-content active">
            <h2>Referrals</h2>
            <div className="referral-container">
              <div className="referral-main">
                <h3>Referral Info</h3>
                <div className="referral-input-container">
                  <input type="text" className="referral-input" value={referralCode} readOnly />
                  <button
                    className="referral-input-button copy-code"
                    onClick={() => copyText(referralCode)}
                  >
                    Copy Code
                  </button>
                </div>
                {/* <div className="referral-input-container">
                  <input type="text" className="referral-input" value={referralLink} readOnly />
                  <button
                    className="referral-input-button copy-link"
                    onClick={() => copyText(referralLink)}
                  >
                    Copy Link
                  </button>
                  <button className="referral-input-button share" onClick={shareReferral}>
                    Share
                  </button>
                </div> */}
                <div className="summary-row">
                  <span className="summary-label">Total Referrals:</span>
                  <span className="summary-value">{referralsCount}</span>
                </div>
                <h3>Referral Ranking</h3>
                <div className="search-container">
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Search wallet..."
                    value={referralSearch}
                    onChange={(e) => {
                      setReferralSearch(e.target.value);
                      setReferralPage(1);
                    }}
                  />
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Wallet</th>
                      <th>Referrals (100 points/ref)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const sortedData = [...referralRanking].sort((a, b) => b.referrals - a.referrals);
                      const filteredData = sortedData.filter((entry) =>
                        entry.wallet.toLowerCase().includes(referralSearch.toLowerCase())
                      );
                      const start = (referralPage - 1) * itemsPerPage;
                      const end = start + itemsPerPage;
                      const paginatedData = filteredData.slice(start, end);
                      return paginatedData.length > 0 ? (
                        paginatedData.map((entry, _) => {
                          const globalIndex = sortedData.indexOf(entry);
                          const rank = globalIndex + 1;
                          return (
                            <tr
                              key={entry.wallet}
                              className={rank === 1 ? 'top-1' : rank === 2 ? 'top-2' : rank === 3 ? 'top-3' : ''}
                            >
                              <td>{rank}</td>
                              <td>{`${entry.wallet.slice(0, 4)}...${entry.wallet.slice(-4)}`}</td>
                              <td>{entry.referrals}</td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan="3">No ranking data available</td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
                <div className="pagination">
                  <button
                    className="pagination-button"
                    onClick={() => setReferralPage((prev) => Math.max(1, prev - 1))}
                    disabled={referralPage === 1}
                  >
                    Previous
                  </button>
                  <button
                    className="pagination-button"
                    onClick={() => setReferralPage((prev) => prev + 1)}
                    disabled={referralRanking.length <= referralPage * itemsPerPage}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      case 'leaderboard':
        return (
          <div className="tab-content active">
            <h2>Leaderboard</h2>
            <div className="tier-info">
              <h3>Tier Info</h3>
              <div className="tier-list">
                {[
                  { tier: 'Tier 1', points: 200, logo: '/tier1.png' },
                  { tier: 'Tier 2', points: 1000, logo: '/tier2.png' },
                  { tier: 'Tier 3', points: 3000, logo: '/tier3.png' },
                  { tier: 'Tier 4', points: 6000, logo: '/tier4.png' },
                  { tier: 'Tier 5', points: 10000, logo: '/tier5.png' },
                ].map((tier) => (
                  <div key={tier.tier} className="tier-item">
                    <div className="tier-image">
                      <img src={tier.logo} alt={`${tier.tier} logo`} />
                    </div>
                    <div className="tier-details">
                      <span className="tier-points">{tier.points} Points</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="search-container">
              <input
                type="text"
                className="search-input"
                placeholder="Search wallet..."
                value={leaderboardSearch}
                onChange={(e) => {
                  setLeaderboardSearch(e.target.value);
                  setLeaderboardPage(1);
                }}
              />
            </div>
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Wallet</th>
                  <th>Points</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const sortedData = [...leaderboard].sort((a, b) => b.points - a.points);
                  const filteredData = sortedData.filter((entry) =>
                    entry.wallet.toLowerCase().includes(leaderboardSearch.toLowerCase())
                  );
                  let userEntry = null;
                  if (walletAddress) {
                    userEntry = filteredData.find((entry) => entry.wallet === walletAddress);
                    if (userEntry) filteredData.splice(filteredData.indexOf(userEntry), 1);
                  }
                  const start = (leaderboardPage - 1) * itemsPerPage;
                  const end = start + itemsPerPage;
                  const paginatedData = filteredData.slice(start, end);
                  const rows = [];
                  if (userEntry) {
                    rows.push(
                      <tr key={userEntry.wallet}>
                        <td>-</td>
                        <td>
                          {`${userEntry.wallet.slice(0, 4)}...${userEntry.wallet.slice(-4)}`}{' '}
                          <span className="you-indicator">(You)</span>
                        </td>
                        <td>{userEntry.points}</td>
                      </tr>
                    );
                  }
                  paginatedData.forEach((entry) => {
                    const globalIndex = sortedData.indexOf(entry);
                    const rank = globalIndex + 1;
                    rows.push(
                      <tr
                        key={entry.wallet}
                        className={rank === 1 ? 'top-1' : rank === 2 ? 'top-2' : rank === 3 ? 'top-3' : ''}
                      >
                        <td>{rank}</td>
                        <td>{`${entry.wallet.slice(0, 4)}...${entry.wallet.slice(-4)}`}</td>
                        <td>{entry.points}</td>
                      </tr>
                    );
                  });
                  return rows.length > 0 ? rows : (
                    <tr>
                      <td colSpan="3">No leaderboard data available</td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
            <div className="pagination">
              <button
                className="pagination-button"
                onClick={() => setLeaderboardPage((prev) => Math.max(1, prev - 1))}
                disabled={leaderboardPage === 1}
              >
                Previous
              </button>
              <button
                className="pagination-button"
                onClick={() => setLeaderboardPage((prev) => prev + 1)}
                disabled={leaderboard.length <= leaderboardPage * itemsPerPage}
              >
                Next
              </button>
            </div>
          </div>
        );
      default:
        return (
          <div className="tab-content active">
            <h2>Invalid Tab</h2>
            <p>Please select a valid tab.</p>
          </div>
        );
    }
  }, [
    activeTab,
    error,
    isLoading,
    currentTier,
    totalPoints,
    todayPoints,
    hoursToday,
    daysSeason1,
    referralsCount,
    isNodeConnected,
    networkStrength,
    referralCode,
    referralLink,
    referralRanking,
    leaderboard,
    referralPage,
    leaderboardPage,
    referralSearch,
    leaderboardSearch,
    walletAddress,
    chartData,
    solanaConnected,
    disconnectSolana,
    toggleNodeConnection,
    copyText,
    shareReferral,
    showReferralInput,
    referralCodeInput,
    referralError,
    isSigning,
    isDiscordLinked,
    discordUsername,
    discordAvatar,
    discordError,
    isDiscordLoading,
    linkDiscord,
    disconnectDiscord,
    handleReferralSubmit,
    handleReferralSkip,
    handleReferralInputChange,
    handleReferralKeyDown,
    reloadRole,
  ]);

  // Socket.IO setup
  useEffect(() => {
    socketRef.current = io(SOCKET_URL, { autoConnect: false });

    socketRef.current.on('connect', () => {
      console.log('Socket.IO connected');
      if (walletAddress) socketRef.current.emit('join', walletAddress);
    });

    socketRef.current.on('points-update', (data) => {
      setTotalPoints(data.totalPoints || 0);
      setTodayPoints(data.todayPoints || 0);
      setHoursToday(data.hoursToday || 0);
      setDaysSeason1(data.daysSeason1 || 0);
      setReferralsCount(data.referralsCount || 0);
      setCurrentTier(data.currentTier || 'None');
      setDailyPoints(data.dailyPoints || Array(14).fill(0));
      setNetworkStrength(data.networkStrength || 0);
      setIsNodeConnected(data.networkStrength > 0);
    });

    socketRef.current.on('leaderboard-update', (data) => {
      setLeaderboard((prev) => {
        const newLeaderboard = [...prev];
        const index = newLeaderboard.findIndex((entry) => entry.wallet === data.publicKey);
        if (index >= 0) {
          newLeaderboard[index].points = data.totalPoints;
        } else {
          newLeaderboard.push({ wallet: data.publicKey, points: data.totalPoints });
        }
        return newLeaderboard;
      });
    });

    socketRef.current.on('disconnect', () => {
      console.log('Socket.IO disconnected');
    });

    if (isConnected && walletAddress) {
      socketRef.current.connect();
    }

    return () => {
      socketRef.current.disconnect();
    };
  }, [isConnected, walletAddress, SOCKET_URL]);

  // Wallet status monitoring
  useEffect(() => {
    if (!connected && isConnected) {
      setIsConnected(false);
      setWalletAddress('');
      setConnectedWallet(null);
      setSolanaConnected(false);
      signedRef.current = false;
      setJwt(null);
      if (checkStorageAccess()) localStorage.removeItem('jwt');
      setError('Wallet disconnected. Please try again.');
    }
  }, [connected, isConnected, checkStorageAccess]);

  // Discord status check
  useEffect(() => {
    const checkDiscordStatus = async () => {
      if (isConnected && walletAddress) {
        try {
          const response = await fetchWithAuth('/discord/status', 'GET');
          if (response && response.isLinked) {
            setIsDiscordLinked(true);
            setDiscordUsername(response.username || '');
            setDiscordAvatar(response.avatar || '');
          } else {
            setIsDiscordLinked(false);
            setDiscordUsername('');
            setDiscordAvatar('');
          }
        } catch (err) {
          console.error('Error checking Discord status:', err);
        }
      }
    };
    checkDiscordStatus();
  }, [isConnected, walletAddress, fetchWithAuth]);

  // Particle animation for non-connected users
  useEffect(() => {
    if (isConnected) return;

    const canvas = document.getElementById('particleCanvas');
    if (!canvas) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    const sphereGeometry = new THREE.SphereGeometry(5, 32, 32);
    const wireframeMaterial = new THREE.MeshBasicMaterial({
      color: 0xe0e0e0,
      wireframe: true,
      transparent: true,
      opacity: 0.3,
    });
    const sphere = new THREE.Mesh(sphereGeometry, wireframeMaterial);
    scene.add(sphere);

    const particleCount = 100;
    const particlesGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 5 + (Math.random() - 0.5) * 0.2;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      colors[i * 3] = 0.9 + Math.random() * 0.1;
      colors[i * 3 + 1] = 0.9 + Math.random() * 0.1;
      colors[i * 3 + 2] = 0.9 + Math.random() * 0.1;
    }

    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const particleMaterial = new THREE.PointsMaterial({
      size: 0.1,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(particlesGeometry, particleMaterial);
    scene.add(particles);

    camera.position.z = 10;

    const animate = () => {
      requestAnimationFrame(animate);
      sphere.rotation.y += 0.002;
      particles.rotation.y += 0.002;
      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, [isConnected]);

  // Initial fetch
  useEffect(() => {
    if (isConnected && walletAddress) {
      fetchReferralInfo(walletAddress);
      fetchReferralRanking();
      fetchLeaderboard();
      fetchUserStats();
    }
    setIsInitializing(false);
  }, [isConnected, walletAddress, fetchReferralInfo, fetchReferralRanking, fetchLeaderboard, fetchUserStats]);

  return (
    <div className="dashboard-wrapper">
      <Head>
        <title>S.AI App</title>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="description" content="S.AI Dashboard on app.sailabs.xyz" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <header>
        <div className="logo">
          <Image src="/logo.png" alt="Logo" width={100} height={50} loading="lazy" />
        </div>
        {isConnected && (
          <div className="user-info">
            <span className="user-wallet">
              {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
            </span>
            <button className="logout-button" onClick={logout}>
              Logout
            </button>
          </div>
        )}
      </header>
      {isInitializing ? (
        <div className="loading-container">
          <div className="loading-message">loading...</div>
        </div>
      ) : !isConnected ? (
        <div id="loginContainer" className="login-container" style={{ display: 'flex' }}>
          <ParticleEffect />
          <div className="login-box">
            <h2>Sign In</h2>
            {showReferralInput && (
            <p className="referral-optional-text">Referral Code (Optional)</p>
          )}
            {showReferralInput ? (
              <div className="referral-code-container">
                <div className="referral-code-input-wrapper">
                  {[0, 1, 2, 3, 4, 5].map((index) => (
                    <input
                      key={index}
                      type="text"
                      className="referral-code-input"
                      value={referralCodeInput[index]}
                      onChange={(e) => handleReferralInputChange(index, e.target.value)}
                      onKeyDown={(e) => handleReferralKeyDown(index, e)}
                      maxLength={1}
                      ref={(el) => (inputRefs.current[index] = el)}
                    />
                  ))}
                </div>
                {referralError && <div className="referral-error">{referralError}</div>}
                <div className="referral-buttons-wrapper">
                  <button className="referral-submit-button" onClick={handleReferralSubmit}>
                    Submit
                  </button>
                  <button className="referral-skip-button" onClick={handleReferralSkip}>
                    Skip
                  </button>
                </div>
              </div>
            ) : (
              <div className="login-buttons">
                {isSigning ? (
                  <div className="loading-message">Signing wallet, please wait...</div>
                ) : (
                  <>
                    <WalletMultiButton />
                    {error && (
                      <div className="error-message">
                        {console.log('Rendering error:', error)} {/* Log để debug */}
                        {error}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="dashboard-container" style={{ display: 'flex' }}>
          {renderTabs()}
          {renderContent()}
        </div>
      )}
      <footer>
        <div className="footer-links">
          <a href="https://x.com/sailabs_" target='blank'>Twitter</a>
          <a href="https://discord.com/channels/1365343044282486945/1365348227796172873" target='blank'>Discord</a>
          <a href="https://sailabs.xyz/" target='blank'>Website</a>
        </div>
      </footer>
    </div>
  );
}