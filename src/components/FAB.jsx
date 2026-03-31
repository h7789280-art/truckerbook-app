import React from 'react'

export default function FAB({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'fixed',
        bottom: 'calc(72px + env(safe-area-inset-bottom, 0px) + 16px)',
        right: 20,
        width: 56,
        height: 56,
        borderRadius: '50%',
        border: 'none',
        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
        boxShadow: '0 4px 20px rgba(245,158,11,0.4)',
        color: '#fff',
        fontSize: 28,
        fontWeight: 'bold',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        transition: 'transform 0.2s',
      }}
      onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.9)')}
      onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      onTouchStart={(e) => (e.currentTarget.style.transform = 'scale(0.9)')}
      onTouchEnd={(e) => (e.currentTarget.style.transform = 'scale(1)')}
    >
      +
    </button>
  )
}
