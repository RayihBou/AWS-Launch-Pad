import { useState } from 'react';
import { t } from '../i18n';
import './Sidebar.css';

export default function Sidebar({ conversations, activeId, onSelect, onRename, isOpen, onToggle }) {
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');

  const startEdit = (e, conv) => {
    e.stopPropagation();
    setEditingId(conv.conversationId);
    setEditTitle(conv.title || '');
  };

  const saveEdit = (convId) => {
    if (editTitle.trim()) onRename(convId, editTitle.trim());
    setEditingId(null);
  };

  const handleKeyDown = (e, convId) => {
    if (e.key === 'Enter') saveEdit(convId);
    if (e.key === 'Escape') setEditingId(null);
  };

  return (
    <>
      <button className="sidebar-toggle" onClick={onToggle} aria-label="Toggle sidebar">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {isOpen ? <path d="M18 6L6 18M6 6l12 12"/> : <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>}
        </svg>
      </button>
      <aside className={`sidebar${isOpen ? ' sidebar--open' : ''}`}>
        <div className="sidebar__header">{t('sidebar.title')}</div>
        <div className="sidebar__list">
          {conversations.map(conv => (
            <div
              key={conv.conversationId}
              className={`sidebar__item${conv.conversationId === activeId ? ' sidebar__item--active' : ''}`}
              onClick={() => onSelect(conv.conversationId)}
            >
              {editingId === conv.conversationId ? (
                <input
                  className="sidebar__edit"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  onKeyDown={e => handleKeyDown(e, conv.conversationId)}
                  onBlur={() => saveEdit(conv.conversationId)}
                  autoFocus
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <>
                  <span className="sidebar__title">{conv.title || 'New conversation'}</span>
                  <button className="sidebar__edit-btn" onClick={e => startEdit(e, conv)} aria-label="Rename">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
                    </svg>
                  </button>
                </>
              )}
            </div>
          ))}
          {conversations.length === 0 && (
            <div className="sidebar__empty">{t('sidebar.empty')}</div>
          )}
        </div>
      </aside>
      {isOpen && <div className="sidebar-overlay" onClick={onToggle} />}
    </>
  );
}
