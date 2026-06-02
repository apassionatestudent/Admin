import React from 'react';
import { useNavigate } from 'react-router-dom';
import backArrow from '../../assets/icons/back-arrow.png'; 
import './BackButton.css';

const BackButton = ({ destination = 'Enrollments', onClick, className = '' }) => {
  const navigate = useNavigate();
  
  const handleBack = (e) => {
    if (onClick) {
      onClick(e);
    } else {
      navigate(-1);
    }
  };

  return (
    <button 
      className={`enroll-back ${className}`} 
      onClick={handleBack}
    >
      <img src={backArrow} alt="back arrow" className="back-arrow-icon" />
      Back to {destination}
    </button>
  );
};

export default BackButton;