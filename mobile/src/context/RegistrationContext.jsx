import React, { createContext, useContext, useState } from 'react';

const RegistrationContext = createContext();

export const RegistrationProvider = ({ children }) => {
  const [draft, setDraft] = useState(null);

  const saveDraft = (payload) => setDraft(payload || null);
  const clearDraft = () => setDraft(null);

  return (
    <RegistrationContext.Provider value={{ draft, saveDraft, clearDraft }}>
      {children}
    </RegistrationContext.Provider>
  );
};

export const useRegistration = () => useContext(RegistrationContext);
