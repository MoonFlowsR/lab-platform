import { Component } from "react";
import Icon from "./Icon.jsx";

// Keep navigation available if a module fails to load, e.g. after a network interruption.
export default class PageBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="platform-page-error" role="alert">
        <Icon name="warning" size={26} />
        <h2>页面暂时未能打开</h2>
        <p>请检查网络后刷新，或先切换到其他模块。</p>
        <button type="button" onClick={() => window.location.reload()}>
          刷新页面
        </button>
      </section>
    );
  }
}
