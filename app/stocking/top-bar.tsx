import type { AnchorHTMLAttributes, ReactNode } from 'react';

/**
 * Plain <a> on purpose (full page load, no client-side routing): on Cloudflare
 * Pages "/" is the static index.html, and the stocking pages are rendered by the
 * worker, so a normal navigation is the dependable option.
 */
export function PlainLink(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} />;
}

export default function TopBar({ path, children }: { path: string; children?: ReactNode }) {
  return (
    <div className="stk-bar">
      <div className="stk-bar-inner">
        <PlainLink className="stk-brand" href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/sfs-logo2.png" alt="" width={26} height={26} />
          <span>SFS</span>
        </PlainLink>
        <span className="stk-path">{path}</span>
        <div className="stk-bar-end">{children}</div>
      </div>
    </div>
  );
}
