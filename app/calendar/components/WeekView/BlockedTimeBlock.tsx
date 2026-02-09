'use client';

import React from 'react';
import styles from '../../page.module.css';

interface BlockedTime {
  id: number;
  provider_id?: number;
  resource_id?: number;
  start_time: string;
  end_time: string;
  reason: string;
  is_recurring: boolean;
}

interface BlockedTimeBlockProps {
  blockedTime: BlockedTime;
  style: React.CSSProperties;
}

export const BlockedTimeBlock = React.memo<BlockedTimeBlockProps>(
  ({ blockedTime, style }) => {
    return (
      <div
        className={styles.blockedTime}
        style={style}
        title={blockedTime.reason}
        aria-label={`Timp blocat: ${blockedTime.reason}`}
      >
        <div className={styles.blockedTimeIcon}>🚫</div>
        <div className={styles.blockedTimeReason}>{blockedTime.reason}</div>
        {blockedTime.is_recurring && (
          <div className={styles.recurringIndicator}>↻</div>
        )}
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.blockedTime.id === next.blockedTime.id &&
      prev.blockedTime.reason === next.blockedTime.reason &&
      prev.style.top === next.style.top &&
      prev.style.left === next.style.left &&
      prev.style.width === next.style.width &&
      prev.style.height === next.style.height
    );
  }
);

BlockedTimeBlock.displayName = 'BlockedTimeBlock';
