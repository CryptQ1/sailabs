import WalletProviderComponent from '../components/WalletProvider';
import { SessionProvider } from 'next-auth/react';
import '../styles/globals.css';

export default function App({ Component, pageProps: { session, ...pageProps } }) {
  return (
    <SessionProvider session={session}>
      <WalletProviderComponent>
        <Component {...pageProps} />
      </WalletProviderComponent>
    </SessionProvider>
  );
}