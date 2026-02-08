'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from './page.module.css';
import navStyles from '../../dashboard/page.module.css';

export default function NewClientPageClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    source: 'unknown',
    status: 'lead',
    tags: [] as string[],
    notes: '',
  });
  const [tagInput, setTagInput] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/clients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: 1,
          ...formData,
          email: formData.email || undefined,
          phone: formData.phone || undefined,
          notes: formData.notes || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create client');
      }

      const result = await response.json();
      router.push(`/clients/${result.client.id}`);
    } catch (error: any) {
      console.error('Error creating client:', error);
      alert(error.message || 'Eroare la crearea clientului');
    } finally {
      setLoading(false);
    }
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData({
        ...formData,
        tags: [...formData.tags, tagInput.trim()],
      });
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData({
      ...formData,
      tags: formData.tags.filter(tag => tag !== tagToRemove),
    });
  };

  return (
    <div className={navStyles.container}>
      <div className={styles.container}>
        <div className={styles.header}>
          <Link href="/clients" className={styles.backLink} prefetch>
            ← Înapoi la listă
          </Link>
          <h1>Adaugă Client Nou</h1>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.section}>
            <h2>Informații de bază</h2>
            
            <div className={styles.field}>
              <label htmlFor="name">
                Nume <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                id="name"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nume complet"
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="email@example.com"
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="phone">Telefon</label>
              <input
                type="tel"
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+40 123 456 789"
              />
            </div>
          </div>

          <div className={styles.section}>
            <h2>Detalii</h2>
            
            <div className={styles.field}>
              <label htmlFor="source">Sursă</label>
              <select
                id="source"
                value={formData.source}
                onChange={(e) => setFormData({ ...formData, source: e.target.value })}
              >
                <option value="unknown">Necunoscut</option>
                <option value="email">Email</option>
                <option value="facebook">Facebook</option>
                <option value="form">Formular</option>
                <option value="walk-in">Walk-in</option>
                <option value="referral">Recomandare</option>
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="status">Status</label>
              <select
                id="status"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                <option value="lead">Lead</option>
                <option value="active">Activ</option>
                <option value="inactive">Inactiv</option>
                <option value="vip">VIP</option>
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="tags">Tag-uri</label>
              <div className={styles.tagInput}>
                <input
                  type="text"
                  id="tags"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  placeholder="Adaugă tag și apasă Enter"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  className={styles.addTagButton}
                >
                  Adaugă
                </button>
              </div>
              {formData.tags.length > 0 && (
                <div className={styles.tags}>
                  {formData.tags.map((tag, idx) => (
                    <span key={idx} className={styles.tag}>
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className={styles.removeTag}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor="notes">Notițe</label>
              <textarea
                id="notes"
                rows={4}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Notițe despre client..."
              />
            </div>
          </div>

          <div className={styles.actions}>
            <Link href="/clients" className={styles.cancelButton}>
              Anulează
            </Link>
            <button
              type="submit"
              disabled={loading || !formData.name.trim()}
              className={styles.submitButton}
            >
              {loading ? 'Se salvează...' : 'Salvează Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

