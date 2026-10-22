import { Component, type ReactNode } from 'react';
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override render() {
    return this.state.failed ? <main style={{ padding: '12vh 8vw', color: '#eef2f5', background: '#0b1015', minHeight: '100vh' }}><h1>這一頁暫時卡住了</h1><p>已儲存的收藏仍保留在這個瀏覽器。重新整理後再試一次。</p><button onClick={() => location.reload()}>重新整理</button></main> : this.props.children;
  }
}
