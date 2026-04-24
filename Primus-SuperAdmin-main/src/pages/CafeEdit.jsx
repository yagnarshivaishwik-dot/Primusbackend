import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    Save,
    Building2,
    User,
    Mail,
    Phone,
    MapPin,
    CreditCard,
    Monitor,
    Check,
    Loader2,
} from 'lucide-react';
import useAuthStore, { PERMISSIONS } from '../stores/authStore';

const mockCafeData = {
    1: { id: 1, name: 'GameZone Pro', owner_name: 'Rahul Sharma', owner_email: 'rahul@gamezone.in', owner_phone: '+91 98765 43210', location: 'Mumbai, Maharashtra', address: '123 Gaming Street, Andheri West, Mumbai 400053', status: 'subscribed_active', plan: 'Enterprise', mrr: 22500, licensed_pcs: 50, registered_at: '2024-06-15' },
    2: { id: 2, name: 'CyberCafe Elite', owner_name: 'Priya Patel', owner_email: 'priya@cyberelite.com', owner_phone: '+91 87654 32109', location: 'Bangalore, Karnataka', address: '456 Tech Park, Electronic City, Bangalore 560100', status: 'subscribed_active', plan: 'Professional', mrr: 14000, licensed_pcs: 30, registered_at: '2024-08-22' },
    3: { id: 3, name: 'Pixel Paradise', owner_name: 'Amit Kumar', owner_email: 'amit@pixelparadise.in', owner_phone: '+91 76543 21098', location: 'Delhi', address: '789 Game Zone, Connaught Place, New Delhi 110001', status: 'trial_active', plan: 'Trial', mrr: 0, licensed_pcs: 15, registered_at: '2024-11-10' },
};

const STATUS_OPTIONS = [
    { value: 'trial_active', label: 'Trial Active' },
    { value: 'subscribed_active', label: 'Subscribed (Active)' },
    { value: 'subscribed_payment_due', label: 'Payment Due' },
    { value: 'suspended', label: 'Suspended' },
    { value: 'churned', label: 'Churned' },
];

const PLAN_OPTIONS = [
    { value: 'Trial', label: 'Trial' },
    { value: 'Starter', label: 'Starter' },
    { value: 'Professional', label: 'Professional' },
    { value: 'Enterprise', label: 'Enterprise' },
];

export default function CafeEdit() {
    const { id } = require('react-router-dom').useParams();
    const navigate = useNavigate();
    const { hasPermission, isSuperAdmin } = useAuthStore();

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [formData, setFormData] = useState({
        name: '', owner_name: '', owner_email: '', owner_phone: '',
        location: '', address: '', status: '', plan: '', licensed_pcs: 0,
    });

    const canSuspend = hasPermission(PERMISSIONS.SUSPEND_REACTIVATE_CAFES) || isSuperAdmin();
    const canModifyPricing = hasPermission(PERMISSIONS.MODIFY_PRICING) || isSuperAdmin();

    useEffect(() => {
        setTimeout(() => {
            const cafe = mockCafeData[id];
            if (cafe) {
                setFormData({
                    name: cafe.name, owner_name: cafe.owner_name, owner_email: cafe.owner_email,
                    owner_phone: cafe.owner_phone, location: cafe.location, address: cafe.address,
                    status: cafe.status, plan: cafe.plan, licensed_pcs: cafe.licensed_pcs,
                });
            }
            setIsLoading(false);
        }, 300);
    }, [id]);

    const handleChange = (field, value) => setFormData({ ...formData, [field]: value });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        await new Promise(resolve => setTimeout(resolve, 1000));
        setIsSaving(false);
        setSaved(true);
        setTimeout(() => navigate(`/cafes/${id}`), 1000);
    };

    if (isLoading) {
        return (
            <div className="loading-state">
                <div className="spinner" />
                <style>{`
          .loading-state {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 50vh;
          }
        `}</style>
            </div>
        );
    }

    if (saved) {
        return (
            <div className="success-state">
                <div className="success-icon"><Check size={32} /></div>
                <h2>Changes Saved</h2>
                <p>Redirecting...</p>
                <style>{`
          .success-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 50vh;
            text-align: center;
          }
          .success-icon {
            width: 64px;
            height: 64px;
            background: var(--status-success-subtle);
            color: var(--status-success);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: var(--space-6);
          }
          .success-state h2 {
            font-size: var(--text-xl);
            margin-bottom: var(--space-2);
          }
          .success-state p {
            color: var(--text-tertiary);
          }
        `}</style>
            </div>
        );
    }

    return (
        <div className="cafe-edit">
            <button onClick={() => navigate(`/cafes/${id}`)} className="back-link">
                <ArrowLeft size={16} />
                <span>Back to Café</span>
            </button>

            <div className="page-header">
                <h1 className="page-title">Edit Café</h1>
                <p className="page-subtitle">{formData.name}</p>
            </div>

            <form onSubmit={handleSubmit} className="edit-form">
                <section className="form-section glass-card">
                    <h2 className="section-title"><Building2 size={18} /> Basic Information</h2>
                    <div className="form-grid">
                        <div className="input-group">
                            <label className="input-label">Café Name</label>
                            <input type="text" className="input" value={formData.name} onChange={(e) => handleChange('name', e.target.value)} required />
                        </div>
                        <div className="input-group">
                            <label className="input-label">Location</label>
                            <input type="text" className="input" value={formData.location} onChange={(e) => handleChange('location', e.target.value)} />
                        </div>
                        <div className="input-group full-width">
                            <label className="input-label">Full Address</label>
                            <input type="text" className="input" value={formData.address} onChange={(e) => handleChange('address', e.target.value)} />
                        </div>
                    </div>
                </section>

                <section className="form-section glass-card">
                    <h2 className="section-title"><User size={18} /> Owner Details</h2>
                    <div className="form-grid">
                        <div className="input-group">
                            <label className="input-label">Owner Name</label>
                            <input type="text" className="input" value={formData.owner_name} onChange={(e) => handleChange('owner_name', e.target.value)} />
                        </div>
                        <div className="input-group">
                            <label className="input-label">Email</label>
                            <input type="email" className="input" value={formData.owner_email} onChange={(e) => handleChange('owner_email', e.target.value)} />
                        </div>
                        <div className="input-group">
                            <label className="input-label">Phone</label>
                            <input type="tel" className="input" value={formData.owner_phone} onChange={(e) => handleChange('owner_phone', e.target.value)} />
                        </div>
                    </div>
                </section>

                <section className="form-section glass-card">
                    <h2 className="section-title"><CreditCard size={18} /> Subscription</h2>
                    <div className="form-grid">
                        <div className="input-group">
                            <label className="input-label">Status</label>
                            <select className="input select" value={formData.status} onChange={(e) => handleChange('status', e.target.value)} disabled={!canSuspend}>
                                {STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                        </div>
                        <div className="input-group">
                            <label className="input-label">Plan</label>
                            <select className="input select" value={formData.plan} onChange={(e) => handleChange('plan', e.target.value)} disabled={!canModifyPricing}>
                                {PLAN_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                        </div>
                        <div className="input-group">
                            <label className="input-label">Licensed PCs</label>
                            <input type="number" className="input" value={formData.licensed_pcs} onChange={(e) => handleChange('licensed_pcs', parseInt(e.target.value))} min={1} max={500} disabled={!canModifyPricing} />
                        </div>
                    </div>
                </section>

                <div className="form-actions">
                    <button type="button" className="btn btn--ghost" onClick={() => navigate(`/cafes/${id}`)}>Cancel</button>
                    <button type="submit" className="btn btn--primary" disabled={isSaving}>
                        {isSaving ? <><Loader2 size={16} className="spin" /> Saving...</> : <><Save size={16} /> Save Changes</>}
                    </button>
                </div>
            </form>

            <style>{`
        .cafe-edit { max-width: 800px; }
        .back-link {
          display: inline-flex;
          align-items: center;
          gap: var(--space-2);
          color: var(--text-secondary);
          font-size: var(--text-sm);
          margin-bottom: var(--space-6);
          background: none;
          border: none;
          cursor: pointer;
          transition: color var(--duration-fast) var(--ease-out);
        }
        .back-link:hover { color: var(--accent-primary); }
        .page-header { margin-bottom: var(--space-8); }
        .page-title {
          font-size: var(--text-2xl);
          font-weight: 600;
          margin-bottom: var(--space-2);
          letter-spacing: -0.02em;
        }
        .page-subtitle { font-size: var(--text-sm); color: var(--text-tertiary); }
        .edit-form { display: flex; flex-direction: column; gap: var(--space-6); }
        .form-section { padding: var(--space-6); }
        .section-title {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          font-size: var(--text-base);
          font-weight: 600;
          margin-bottom: var(--space-6);
          color: var(--text-primary);
        }
        .section-title svg { color: var(--text-tertiary); }
        .form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-5); }
        .full-width { grid-column: 1 / -1; }
        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: var(--space-3);
          padding-top: var(--space-6);
          border-top: 1px solid var(--divider);
        }
        @media (max-width: 640px) { .form-grid { grid-template-columns: 1fr; } }
      `}</style>
        </div>
    );
}
