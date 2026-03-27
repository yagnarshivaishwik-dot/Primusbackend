const Widget = ({ icon, iconBg, title, children }) => {
    return (
        <div className="widget">
            {(icon || title) && (
                <div className="widget__header">
                    {icon && (
                        <div className="widget__icon" style={{ background: iconBg }}>
                            {icon}
                        </div>
                    )}
                    {title && <div className="widget__title">{title}</div>}
                </div>
            )}
            <div className="widget__content">
                {children}
            </div>
        </div>
    );
};

export const ProgressWidget = ({ title, icon, iconBg, current, total, label, actionLabel }) => {
    const percentage = (current / total) * 100;

    return (
        <Widget icon={icon} iconBg={iconBg} title={title}>
            <p style={{ marginBottom: 'var(--spacing-sm)' }}>{label}</p>
            <div className="widget__progress">
                <div className="progress-bar">
                    <div
                        className="progress-bar__fill"
                        style={{ width: `${percentage}%` }}
                    />
                </div>
                <div className="progress-bar__label">
                    <span>{current} / {total}</span>
                    <span>{Math.round(percentage)}%</span>
                </div>
            </div>
            {actionLabel && (
                <button className="btn btn-primary btn-sm" style={{ width: '100%', marginTop: 'var(--spacing-md)' }}>
                    {actionLabel}
                </button>
            )}
        </Widget>
    );
};

export const SocialWidget = ({ title, items }) => {
    return (
        <Widget title={title}>
            <div className="social-feed">
                {items.map((item, index) => (
                    <div key={index} className="social-item">
                        <div className="social-item__avatar">{item.initials}</div>
                        <div className="social-item__content">
                            <div className="social-item__text">
                                <strong>{item.name}</strong> {item.action}
                            </div>
                            <div className="social-item__time">{item.time}</div>
                        </div>
                    </div>
                ))}
            </div>
        </Widget>
    );
};

export default Widget;
