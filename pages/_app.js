import WalletProviderComponent from '../components/WalletProvider';
import '../styles/globals.css';

export default function App({ Component, pageProps  }) {
  return (
      <WalletProviderComponent>
        <Component {...pageProps} />
      </WalletProviderComponent>
  );
}