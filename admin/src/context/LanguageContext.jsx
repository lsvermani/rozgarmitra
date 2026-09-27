import { useState } from 'react';
import { LANGUAGES, LanguageContext } from './useLanguage';

const translations = {
  en: {
    worker: 'Worker', creator: 'Job creator', workerAccess: 'WORKER ACCESS', creatorAccess: 'JOB CREATOR ACCESS',
    workerTitle: 'Find work that fits your day.', creatorTitle: 'Build your team for today.',
    workerSubtitle: 'Browse local tasks and accept the right opportunity.', creatorSubtitle: 'Post a task and connect with reliable local workers.',
    local: 'Local opportunities', direct: 'Direct connection', trusted: 'Trusted profiles', signIn: 'Sign in to continue',
    workerMobile: 'Worker mobile number', creatorMobile: 'Job creator mobile number', sendOtp: 'Send OTP', sending: 'Sending...',
    verify: 'Verify', verifying: 'Verifying...', workerDashboard: 'Open worker dashboard', creatorDashboard: 'Open creator dashboard',
    enterOtp: 'Enter OTP sent to', differentNumber: 'Use a different number', demoWorker: 'Demo worker: 9000000010', demoCreator: 'Demo creator: 9000000020',
    dashboard: 'Dashboard', users: 'Users', jobs: 'Jobs', reports: 'Reports', preview: 'Task Preview', logout: 'Logout', adminPanel: 'Admin Panel',
    addTask: 'Add a task', postWork: 'Post work and make it available to local workers.', yourTasks: 'YOUR TASKS', saved: 'Saved in database',
    noTasks: 'No tasks added yet.', loadingTasks: 'Loading tasks...', taskTitle: 'Task title', description: 'Description', category: 'Category',
    workersNeeded: 'Workers needed', date: 'Date', location: 'Location', start: 'Start', end: 'End', payment: 'Payment', unit: 'Unit',
    perDay: 'Per day', perHour: 'Per hour', perTask: 'Per task', adding: 'Adding task...',
    jobsAvailable: 'jobs available', findJobs: 'Find nearby work. Apply in one tap.', signOut: 'Sign out', jobBoard: 'JOB BOARD', workNear: 'Work near you',
    browse: 'Browse local opportunities and send your application directly to the job creator.', search: 'Search jobs, skills or locations', allCategories: 'All categories',
    apply: 'Apply now', applying: 'Applying...', applied: 'Applied', closed: 'Closed', openApplications: 'Open for applications',
  },
  hi: {
    worker: 'कामगार', creator: 'काम देने वाला', workerAccess: 'कामगार प्रवेश', creatorAccess: 'काम देने वाले का प्रवेश', workerTitle: 'अपने दिन के अनुसार काम खोजें।', creatorTitle: 'आज की अपनी टीम बनाएं।', workerSubtitle: 'स्थानीय काम देखें और सही अवसर स्वीकार करें।', creatorSubtitle: 'काम जोड़ें और भरोसेमंद कामगारों से जुड़ें।', local: 'स्थानीय अवसर', direct: 'सीधा संपर्क', trusted: 'भरोसेमंद प्रोफाइल', signIn: 'जारी रखने के लिए साइन इन करें', workerMobile: 'कामगार मोबाइल नंबर', creatorMobile: 'काम देने वाले का मोबाइल नंबर', sendOtp: 'OTP भेजें', sending: 'भेज रहे हैं...', verify: 'सत्यापित करें', verifying: 'सत्यापित कर रहे हैं...', workerDashboard: 'कामगार डैशबोर्ड खोलें', creatorDashboard: 'डैशबोर्ड खोलें', enterOtp: 'इस नंबर पर भेजा OTP दर्ज करें', differentNumber: 'दूसरा नंबर इस्तेमाल करें', demoWorker: 'डेमो कामगार: 9000000010', demoCreator: 'डेमो काम देने वाला: 9000000020', dashboard: 'डैशबोर्ड', users: 'उपयोगकर्ता', jobs: 'काम', reports: 'रिपोर्ट', preview: 'पूर्वावलोकन', logout: 'लॉगआउट', adminPanel: 'एडमिन पैनल', addTask: 'काम जोड़ें', postWork: 'काम पोस्ट करें और स्थानीय कामगारों को उपलब्ध कराएं।', yourTasks: 'आपके काम', saved: 'डेटाबेस में सुरक्षित', noTasks: 'अभी कोई काम नहीं जोड़ा गया।', loadingTasks: 'काम लोड हो रहे हैं...', taskTitle: 'काम का शीर्षक', description: 'विवरण', category: 'श्रेणी', workersNeeded: 'कामगारों की संख्या', date: 'तारीख', location: 'स्थान', start: 'शुरू', end: 'अंत', payment: 'भुगतान', unit: 'इकाई', perDay: 'प्रति दिन', perHour: 'प्रति घंटा', perTask: 'प्रति काम', adding: 'काम जोड़ रहे हैं...', jobsAvailable: 'काम उपलब्ध', findJobs: 'अपने पास काम खोजें। एक टैप में आवेदन करें।', signOut: 'बाहर निकलें', jobBoard: 'काम बोर्ड', workNear: 'अपने पास काम', browse: 'स्थानीय अवसर देखें और काम देने वाले को सीधे आवेदन भेजें।', search: 'काम, कौशल या स्थान खोजें', allCategories: 'सभी श्रेणियां', apply: 'अभी आवेदन करें', applying: 'आवेदन कर रहे हैं...', applied: 'आवेदन किया', closed: 'बंद', openApplications: 'आवेदन खुले हैं',
  },
};

translations.pa = {
  worker: 'ਕਾਮਗਾਰ', creator: 'ਨੌਕਰੀ ਦੇਣ ਵਾਲਾ', workerAccess: 'ਕਾਮਗਾਰ ਦਾਖਲਾ', creatorAccess: 'ਨੌਕਰੀ ਦੇਣ ਵਾਲੇ ਦਾ ਦਾਖਲਾ', workerTitle: 'ਆਪਣੇ ਦਿਨ ਲਈ ਢੁੱਕਵਾਂ ਕੰਮ ਲੱਭੋ।', creatorTitle: 'ਅੱਜ ਲਈ ਆਪਣੀ ਟੀਮ ਬਣਾਓ।', workerSubtitle: 'ਸਥਾਨਕ ਕੰਮ ਵੇਖੋ ਅਤੇ ਸਹੀ ਮੌਕਾ ਸਵੀਕਾਰ ਕਰੋ।', creatorSubtitle: 'ਕੰਮ ਪਾਓ ਅਤੇ ਭਰੋਸੇਮੰਦ ਸਥਾਨਕ ਕਾਮਗਾਰਾਂ ਨਾਲ ਜੁੜੋ।', local: 'ਸਥਾਨਕ ਮੌਕੇ', direct: 'ਸਿੱਧਾ ਸੰਪਰਕ', trusted: 'ਭਰੋਸੇਮੰਦ ਪ੍ਰੋਫਾਈਲ', signIn: 'ਜਾਰੀ ਰੱਖਣ ਲਈ ਸਾਈਨ ਇਨ ਕਰੋ', workerMobile: 'ਕਾਮਗਾਰ ਮੋਬਾਈਲ ਨੰਬਰ', creatorMobile: 'ਨੌਕਰੀ ਦੇਣ ਵਾਲੇ ਦਾ ਮੋਬਾਈਲ ਨੰਬਰ', sendOtp: 'OTP ਭੇਜੋ', sending: 'ਭੇਜਿਆ ਜਾ ਰਿਹਾ ਹੈ...', verify: 'ਪੜਤਾਲ ਕਰੋ', verifying: 'ਪੜਤਾਲ ਹੋ ਰਹੀ ਹੈ...', workerDashboard: 'ਕਾਮਗਾਰ ਡੈਸ਼ਬੋਰਡ ਖੋਲ੍ਹੋ', creatorDashboard: 'ਡੈਸ਼ਬੋਰਡ ਖੋਲ੍ਹੋ', enterOtp: 'ਇਸ ਨੰਬਰ ਤੇ ਭੇਜਿਆ OTP ਦਰਜ ਕਰੋ', differentNumber: 'ਵੱਖਰਾ ਨੰਬਰ ਵਰਤੋ', demoWorker: 'ਡੈਮੋ ਕਾਮਗਾਰ: 9000000010', demoCreator: 'ਡੈਮੋ ਨੌਕਰੀ ਦੇਣ ਵਾਲਾ: 9000000020', dashboard: 'ਡੈਸ਼ਬੋਰਡ', users: 'ਵਰਤੋਂਕਾਰ', jobs: 'ਕੰਮ', reports: 'ਰਿਪੋਰਟਾਂ', preview: 'ਝਲਕ', logout: 'ਲੌਗਆਊਟ', adminPanel: 'ਐਡਮਿਨ ਪੈਨਲ', addTask: 'ਕੰਮ ਸ਼ਾਮਲ ਕਰੋ', postWork: 'ਕੰਮ ਪਾਓ ਅਤੇ ਸਥਾਨਕ ਕਾਮਗਾਰਾਂ ਲਈ ਉਪਲਬਧ ਕਰੋ।', yourTasks: 'ਤੁਹਾਡੇ ਕੰਮ', saved: 'ਡੇਟਾਬੇਸ ਵਿੱਚ ਸੁਰੱਖਿਅਤ', noTasks: 'ਅਜੇ ਕੋਈ ਕੰਮ ਨਹੀਂ।', loadingTasks: 'ਕੰਮ ਲੋਡ ਹੋ ਰਹੇ ਹਨ...', taskTitle: 'ਕੰਮ ਦਾ ਸਿਰਲੇਖ', description: 'ਵੇਰਵਾ', category: 'ਸ਼੍ਰੇਣੀ', workersNeeded: 'ਲੋੜੀਂਦੇ ਕਾਮਗਾਰ', date: 'ਤਾਰੀਖ', location: 'ਸਥਾਨ', start: 'ਸ਼ੁਰੂ', end: 'ਅੰਤ', payment: 'ਭੁਗਤਾਨ', unit: 'ਇਕਾਈ', perDay: 'ਪ੍ਰਤੀ ਦਿਨ', perHour: 'ਪ੍ਰਤੀ ਘੰਟਾ', perTask: 'ਪ੍ਰਤੀ ਕੰਮ', adding: 'ਕੰਮ ਸ਼ਾਮਲ ਹੋ ਰਿਹਾ ਹੈ...', jobsAvailable: 'ਕੰਮ ਉਪਲਬਧ', findJobs: 'ਨੇੜੇ ਕੰਮ ਲੱਭੋ। ਇੱਕ ਟੈਪ ਵਿੱਚ ਅਰਜ਼ੀ ਦਿਓ।', signOut: 'ਸਾਈਨ ਆਊਟ', jobBoard: 'ਕੰਮ ਬੋਰਡ', workNear: 'ਆਪਣੇ ਨੇੜੇ ਕੰਮ', browse: 'ਸਥਾਨਕ ਮੌਕੇ ਵੇਖੋ ਅਤੇ ਨੌਕਰੀ ਦੇਣ ਵਾਲੇ ਨੂੰ ਸਿੱਧੀ ਅਰਜ਼ੀ ਭੇਜੋ।', search: 'ਕੰਮ, ਹੁਨਰ ਜਾਂ ਸਥਾਨ ਲੱਭੋ', allCategories: 'ਸਾਰੀਆਂ ਸ਼੍ਰੇਣੀਆਂ', apply: 'ਹੁਣੇ ਅਰਜ਼ੀ ਦਿਓ', applying: 'ਅਰਜ਼ੀ ਭੇਜੀ ਜਾ ਰਹੀ ਹੈ...', applied: 'ਅਰਜ਼ੀ ਦਿੱਤੀ', closed: 'ਬੰਦ', openApplications: 'ਅਰਜ਼ੀਆਂ ਖੁੱਲ੍ਹੀਆਂ ਹਨ',
};

translations.mr = { ...translations.hi, worker: 'कामगार', creator: 'काम देणारा', workerTitle: 'तुमच्या दिवसाला योग्य काम शोधा.', creatorTitle: 'आजची तुमची टीम तयार करा.', workerSubtitle: 'स्थानिक कामे पाहा आणि योग्य संधी स्वीकारा.', creatorSubtitle: 'काम पोस्ट करा आणि विश्वासू कामगारांशी जोडा.', local: 'स्थानिक संधी', direct: 'थेट संपर्क', trusted: 'विश्वासू प्रोफाइल', signIn: 'पुढे जाण्यासाठी साइन इन करा', workerMobile: 'कामगार मोबाइल नंबर', creatorMobile: 'काम देणाऱ्याचा मोबाइल नंबर', sendOtp: 'OTP पाठवा', dashboard: 'डॅशबोर्ड', addTask: 'काम जोडा', postWork: 'काम पोस्ट करा आणि स्थानिक कामगारांना उपलब्ध करा.', yourTasks: 'तुमची कामे', saved: 'डेटाबेसमध्ये जतन', noTasks: 'अजून कामे नाहीत.', loadingTasks: 'कामे लोड होत आहेत...', taskTitle: 'कामाचे शीर्षक', description: 'वर्णन', category: 'श्रेणी', workersNeeded: 'आवश्यक कामगार', location: 'ठिकाण', payment: 'देयक', jobsAvailable: 'कामे उपलब्ध', jobBoard: 'काम बोर्ड', workNear: 'तुमच्या जवळचे काम', apply: 'आता अर्ज करा', applied: 'अर्ज केला', closed: 'बंद' };
translations.ne = { ...translations.en, worker: 'कामदार', creator: 'कामदाता', workerAccess: 'कामदार प्रवेश', creatorAccess: 'कामदाता प्रवेश', workerTitle: 'तपाईंको दिनलाई मिल्ने काम खोज्नुहोस्।', creatorTitle: 'आजको आफ्नो टोली बनाउनुहोस्।', workerSubtitle: 'स्थानीय काम हेर्नुहोस् र सही अवसर स्वीकार गर्नुहोस्।', creatorSubtitle: 'काम पोस्ट गर्नुहोस् र भरपर्दा कामदारसँग जोडिनुहोस्।', local: 'स्थानीय अवसर', direct: 'प्रत्यक्ष सम्पर्क', trusted: 'विश्वसनीय प्रोफाइल', signIn: 'जारी राख्न साइन इन गर्नुहोस्', sendOtp: 'OTP पठाउनुहोस्', dashboard: 'ड्यासबोर्ड', addTask: 'काम थप्नुहोस्', postWork: 'काम पोस्ट गरेर स्थानीय कामदारलाई उपलब्ध गराउनुहोस्।', yourTasks: 'तपाईंका काम', saved: 'डाटाबेसमा सुरक्षित', noTasks: 'अहिलेसम्म काम थपिएको छैन।', loadingTasks: 'काम लोड हुँदैछ...', taskTitle: 'कामको शीर्षक', description: 'विवरण', category: 'श्रेणी', location: 'स्थान', payment: 'भुक्तानी', jobsAvailable: 'काम उपलब्ध', jobBoard: 'काम बोर्ड', workNear: 'तपाईं नजिकको काम', apply: 'अहिले आवेदन दिनुहोस्', applied: 'आवेदन दिइयो', closed: 'बन्द' };
translations.bh = { ...translations.hi, worker: 'मजदूर', creator: 'काम देवे वाला', workerTitle: 'आपन दिन के हिसाब से काम खोजीं।', creatorTitle: 'आज के आपन टीम बनाईं।', workerSubtitle: 'नजदीकी काम देखीं आ सही मौका स्वीकार करीं।', creatorSubtitle: 'काम डालीं आ भरोसेमंद मजदूर से जुड़ीं।', local: 'नजदीकी मौका', direct: 'सीधा संपर्क', trusted: 'भरोसेमंद प्रोफाइल', signIn: 'आगे बढ़े खातिर साइन इन करीं', sendOtp: 'OTP भेजीं', dashboard: 'डैशबोर्ड', addTask: 'काम जोड़ीं', postWork: 'काम डालीं आ स्थानीय मजदूर खातिर उपलब्ध करीं।', yourTasks: 'आपन काम', saved: 'डेटाबेस में सुरक्षित', noTasks: 'अभी कवनो काम नइखे।', loadingTasks: 'काम लोड हो रहल बा...', jobsAvailable: 'काम उपलब्ध बा', jobBoard: 'काम बोर्ड', workNear: 'नजदीकी काम', apply: 'अबही आवेदन करीं', applied: 'आवेदन हो गइल', closed: 'बंद' };
translations.bho = { ...translations.bh, workerTitle: 'आपन दिन के हिसाब से काम खोजीं।', creatorTitle: 'आज खातिर आपन टीम बनाईं।', workerSubtitle: 'नजदीकी काम देखीं आ सही मौका स्वीकार करीं।', creatorSubtitle: 'काम डालीं आ भरोसेमंद स्थानीय कामगारन से जुड़ीं।', signIn: 'आगे बढ़े खातिर साइन इन करीं', addTask: 'काम जोड़ीं', yourTasks: 'आपन काम', noTasks: 'अभी कवनो काम नइखे।' };
translations.kn = { ...translations.en, worker: 'ಕೆಲಸಗಾರ', creator: 'ಕೆಲಸ ನೀಡುವವರು', workerAccess: 'ಕೆಲಸಗಾರ ಪ್ರವೇಶ', creatorAccess: 'ಕೆಲಸ ನೀಡುವವರ ಪ್ರವೇಶ', workerTitle: 'ನಿಮ್ಮ ದಿನಕ್ಕೆ ಸರಿಹೊಂದುವ ಕೆಲಸ ಹುಡುಕಿ.', creatorTitle: 'ಇಂದಿನ ನಿಮ್ಮ ತಂಡವನ್ನು ಕಟ್ಟಿಕೊಳ್ಳಿ.', workerSubtitle: 'ಸ್ಥಳೀಯ ಕೆಲಸಗಳನ್ನು ನೋಡಿ ಸರಿಯಾದ ಅವಕಾಶವನ್ನು ಸ್ವೀಕರಿಸಿ.', creatorSubtitle: 'ಕೆಲಸ ಪ್ರಕಟಿಸಿ ನಂಬಿಕೆಯ ಸ್ಥಳೀಯ ಕೆಲಸಗಾರರೊಂದಿಗೆ ಸಂಪರ್ಕಿಸಿ.', local: 'ಸ್ಥಳೀಯ ಅವಕಾಶಗಳು', direct: 'ನೇರ ಸಂಪರ್ಕ', trusted: 'ನಂಬಿಕೆಯ ಪ್ರೊಫೈಲ್‌ಗಳು', signIn: 'ಮುಂದುವರಿಯಲು ಸೈನ್ ಇನ್ ಮಾಡಿ', sendOtp: 'OTP ಕಳುಹಿಸಿ', dashboard: 'ಡ್ಯಾಶ್‌ಬೋರ್ಡ್', addTask: 'ಕೆಲಸ ಸೇರಿಸಿ', postWork: 'ಕೆಲಸ ಪ್ರಕಟಿಸಿ ಸ್ಥಳೀಯ ಕೆಲಸಗಾರರಿಗೆ ಲಭ್ಯವಾಗಿಸಿ.', yourTasks: 'ನಿಮ್ಮ ಕೆಲಸಗಳು', saved: 'ಡೇಟಾಬೇಸ್‌ನಲ್ಲಿ ಉಳಿಸಲಾಗಿದೆ', noTasks: 'ಇನ್ನೂ ಯಾವುದೇ ಕೆಲಸ ಸೇರಿಸಲಾಗಿಲ್ಲ.', loadingTasks: 'ಕೆಲಸಗಳು ಲೋಡ್ ಆಗುತ್ತಿವೆ...', taskTitle: 'ಕೆಲಸದ ಶೀರ್ಷಿಕೆ', description: 'ವಿವರಣೆ', category: 'ವರ್ಗ', location: 'ಸ್ಥಳ', payment: 'ಪಾವತಿ', jobsAvailable: 'ಕೆಲಸಗಳು ಲಭ್ಯವಿವೆ', jobBoard: 'ಕೆಲಸ ಬೋರ್ಡ್', workNear: 'ನಿಮ್ಮ ಹತ್ತಿರದ ಕೆಲಸ', apply: 'ಈಗ ಅರ್ಜಿ ಸಲ್ಲಿಸಿ', applied: 'ಅರ್ಜಿ ಸಲ್ಲಿಸಲಾಗಿದೆ', closed: 'ಮುಚ್ಚಲಾಗಿದೆ' };
translations.ml = { ...translations.en, worker: 'തൊഴിലാളി', creator: 'ജോലി നൽകുന്നവർ', workerAccess: 'തൊഴിലാളി പ്രവേശനം', creatorAccess: 'ജോലി നൽകുന്നവരുടെ പ്രവേശനം', workerTitle: 'നിങ്ങളുടെ ദിവസത്തിന് അനുയോജ്യമായ ജോലി കണ്ടെത്തൂ.', creatorTitle: 'ഇന്നത്തെ നിങ്ങളുടെ ടീമിനെ സൃഷ്ടിക്കൂ.', workerSubtitle: 'പ്രാദേശിക ജോലികൾ കാണുകയും ശരിയായ അവസരം സ്വീകരിക്കുകയും ചെയ്യൂ.', creatorSubtitle: 'ജോലി പോസ്റ്റ് ചെയ്ത് വിശ്വസനീയരായ തൊഴിലാളികളുമായി ബന്ധപ്പെടൂ.', local: 'പ്രാദേശിക അവസരങ്ങൾ', direct: 'നേരിട്ടുള്ള ബന്ധം', trusted: 'വിശ്വസനീയ പ്രൊഫൈലുകൾ', signIn: 'തുടരാൻ സൈൻ ഇൻ ചെയ്യൂ', sendOtp: 'OTP അയയ്ക്കുക', dashboard: 'ഡാഷ്ബോർഡ്', addTask: 'ജോലി ചേർക്കുക', postWork: 'ജോലി പോസ്റ്റ് ചെയ്ത് പ്രാദേശിക തൊഴിലാളികൾക്ക് ലഭ്യമാക്കുക.', yourTasks: 'നിങ്ങളുടെ ജോലികൾ', saved: 'ഡാറ്റാബേസിൽ സംരക്ഷിച്ചു', noTasks: 'ഇതുവരെ ജോലികൾ ചേർത്തിട്ടില്ല.', loadingTasks: 'ജോലികൾ ലോഡ് ചെയ്യുന്നു...', taskTitle: 'ജോലിയുടെ പേര്', description: 'വിവരണം', category: 'വിഭാഗം', location: 'സ്ഥലം', payment: 'പേയ്മെന്റ്', jobsAvailable: 'ജോലികൾ ലഭ്യമാണ്', jobBoard: 'ജോലി ബോർഡ്', workNear: 'നിങ്ങളുടെ അടുത്തുള്ള ജോലി', apply: 'ഇപ്പോൾ അപേക്ഷിക്കുക', applied: 'അപേക്ഷിച്ചു', closed: 'അടച്ചു' };
translations.te = { ...translations.en, worker: 'కార్మికుడు', creator: 'పని ఇచ్చేవారు', workerAccess: 'కార్మికుడి ప్రవేశం', creatorAccess: 'పని ఇచ్చేవారి ప్రవేశం', workerTitle: 'మీ రోజుకు సరిపోయే పని కనుగొనండి.', creatorTitle: 'ఈరోజు మీ బృందాన్ని నిర్మించండి.', workerSubtitle: 'స్థానిక పనులను చూసి సరైన అవకాశాన్ని స్వీకరించండి.', creatorSubtitle: 'పని జోడించి నమ్మకమైన స్థానిక కార్మికులతో కలవండి.', local: 'స్థానిక అవకాశాలు', direct: 'నేరుగా సంప్రదింపు', trusted: 'నమ్మకమైన ప్రొఫైళ్లు', signIn: 'కొనసాగడానికి సైన్ ఇన్ చేయండి', sendOtp: 'OTP పంపండి', dashboard: 'డ్యాష్‌బోర్డ్', addTask: 'పని జోడించండి', postWork: 'పని జోడించి స్థానిక కార్మికులకు అందుబాటులో ఉంచండి.', yourTasks: 'మీ పనులు', saved: 'డేటాబేస్‌లో భద్రపరచబడింది', noTasks: 'ఇంకా పనులు జోడించలేదు.', loadingTasks: 'పనులు లోడ్ అవుతున్నాయి...', taskTitle: 'పని పేరు', description: 'వివరణ', category: 'వర్గం', location: 'స్థలం', payment: 'చెల్లింపు', jobsAvailable: 'పనులు అందుబాటులో ఉన్నాయి', jobBoard: 'పని బోర్డు', workNear: 'మీ దగ్గర పని', apply: 'ఇప్పుడే దరఖాస్తు చేయండి', applied: 'దరఖాస్తు చేశారు', closed: 'మూసివేయబడింది' };

const statusTranslations = {
  en: { applicationsReceived: 'Applications received', workerSelected: 'Worker selected', inProgress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' },
  hi: { applicationsReceived: 'आवेदन प्राप्त हुए', workerSelected: 'कामगार चुना गया', inProgress: 'काम चल रहा है', completed: 'पूरा हुआ', cancelled: 'रद्द किया गया' },
  pa: { applicationsReceived: 'ਅਰਜ਼ੀਆਂ ਮਿਲੀਆਂ', workerSelected: 'ਕਾਮਗਾਰ ਚੁਣਿਆ ਗਿਆ', inProgress: 'ਕੰਮ ਚੱਲ ਰਿਹਾ ਹੈ', completed: 'ਪੂਰਾ ਹੋਇਆ', cancelled: 'ਰੱਦ ਕੀਤਾ ਗਿਆ' },
  mr: { applicationsReceived: 'अर्ज प्राप्त झाले', workerSelected: 'कामगार निवडला', inProgress: 'काम सुरू आहे', completed: 'पूर्ण झाले', cancelled: 'रद्द केले' },
  bh: { applicationsReceived: 'आवेदन मिलल', workerSelected: 'मजदूर चुनाइल', inProgress: 'काम चल रहल बा', completed: 'पूरा हो गइल', cancelled: 'रद्द हो गइल' },
  bho: { applicationsReceived: 'आवेदन मिलल', workerSelected: 'कामगार चुनाइल', inProgress: 'काम चल रहल बा', completed: 'पूरा हो गइल', cancelled: 'रद्द हो गइल' },
  ne: { applicationsReceived: 'आवेदनहरू प्राप्त भए', workerSelected: 'कामदार छानियो', inProgress: 'काम भइरहेको छ', completed: 'पूरा भयो', cancelled: 'रद्द गरियो' },
  kn: { applicationsReceived: 'ಅರ್ಜಿಗಳು ಬಂದಿವೆ', workerSelected: 'ಕೆಲಸಗಾರ ಆಯ್ಕೆ', inProgress: 'ಕೆಲಸ ನಡೆಯುತ್ತಿದೆ', completed: 'ಪೂರ್ಣಗೊಂಡಿದೆ', cancelled: 'ರದ್ದು ಮಾಡಲಾಗಿದೆ' },
  ml: { applicationsReceived: 'അപേക്ഷകൾ ലഭിച്ചു', workerSelected: 'തൊഴിലാളിയെ തിരഞ്ഞെടുത്തു', inProgress: 'ജോലി പുരോഗതിയിൽ', completed: 'പൂർത്തിയായി', cancelled: 'റദ്ദാക്കി' },
  te: { applicationsReceived: 'దరఖాస్తులు వచ్చాయి', workerSelected: 'కార్మికుడిని ఎంచుకున్నారు', inProgress: 'పని జరుగుతోంది', completed: 'పూర్తయింది', cancelled: 'రద్దు చేయబడింది' },
};

const welcomeTranslations = {
  en: ['Your next opportunity starts here.', 'Tell us your name first. Then choose whether you are looking for work or hiring a worker.', 'FIRST STEP', 'What should we call you?', 'Use the name you want to see across your Rozgarmitra experience.', 'Your name', 'Enter your name', 'Continue', 'You can choose Worker or Job creator on the next screen.', 'Please enter at least 2 characters.', 'Tell us who you are', 'Choose your path', 'Get started securely'],
  hi: ['आपका अगला अवसर यहां से शुरू होता है।', 'पहले अपना नाम बताएं। फिर चुनें कि आप काम ढूंढ रहे हैं या कामगार।', 'पहला कदम', 'हम आपको किस नाम से बुलाएं?', 'वह नाम लिखें जिसे आप Rozgarmitra में देखना चाहते हैं।', 'आपका नाम', 'अपना नाम लिखें', 'जारी रखें', 'अगली स्क्रीन पर Worker या Job creator चुनें।', 'कम से कम 2 अक्षर लिखें।', 'अपने बारे में बताएं', 'अपना रास्ता चुनें', 'सुरक्षित शुरुआत करें'],
  pa: ['ਤੁਹਾਡਾ ਅਗਲਾ ਮੌਕਾ ਇੱਥੋਂ ਸ਼ੁਰੂ ਹੁੰਦਾ ਹੈ।', 'ਪਹਿਲਾਂ ਆਪਣਾ ਨਾਮ ਦੱਸੋ। ਫਿਰ ਚੁਣੋ ਕਿ ਤੁਸੀਂ ਕੰਮ ਲੱਭ ਰਹੇ ਹੋ ਜਾਂ ਕਾਮਗਾਰ ਰੱਖ ਰਹੇ ਹੋ।', 'ਪਹਿਲਾ ਕਦਮ', 'ਅਸੀਂ ਤੁਹਾਨੂੰ ਕਿਸ ਨਾਮ ਨਾਲ ਬੁਲਾਈਏ?', 'ਉਹ ਨਾਮ ਲਿਖੋ ਜੋ ਤੁਸੀਂ Rozgarmitra ਵਿੱਚ ਦੇਖਣਾ ਚਾਹੁੰਦੇ ਹੋ।', 'ਤੁਹਾਡਾ ਨਾਮ', 'ਆਪਣਾ ਨਾਮ ਲਿਖੋ', 'ਜਾਰੀ ਰੱਖੋ', 'ਅਗਲੀ ਸਕ੍ਰੀਨ ਤੇ Worker ਜਾਂ Job creator ਚੁਣੋ।', 'ਘੱਟੋ-ਘੱਟ 2 ਅੱਖਰ ਲਿਖੋ।', 'ਆਪਣੇ ਬਾਰੇ ਦੱਸੋ', 'ਆਪਣਾ ਰਸਤਾ ਚੁਣੋ', 'ਸੁਰੱਖਿਅਤ ਸ਼ੁਰੂਆਤ ਕਰੋ'],
  mr: ['तुमची पुढची संधी इथून सुरू होते.', 'आधी तुमचे नाव सांगा. मग तुम्ही काम शोधत आहात की कामगार शोधत आहात ते निवडा.', 'पहिली पायरी', 'आम्ही तुम्हाला कोणत्या नावाने बोलवू?', 'Rozgarmitra मध्ये दिसावे असे नाव लिहा.', 'तुमचे नाव', 'तुमचे नाव लिहा', 'पुढे जा', 'पुढील स्क्रीनवर Worker किंवा Job creator निवडा.', 'किमान 2 अक्षरे लिहा.', 'तुमच्याबद्दल सांगा', 'तुमचा मार्ग निवडा', 'सुरक्षित सुरुवात करा'],
  bh: ['आपन अगिला मौका इहे से शुरू होला।', 'पहिले आपन नाम बताईं। फेर चुनीं कि काम खोजत बानी या कामगार राखत बानी।', 'पहिला कदम', 'हम रउआ के का नाम से बोलाईं?', 'Rozgarmitra में देखे वाला नाम लिखीं।', 'रउआ के नाम', 'आपन नाम लिखीं', 'आगे बढ़ीं', 'अगिला स्क्रीन पर Worker या Job creator चुनीं।', 'कम से कम 2 अक्षर लिखीं।', 'अपना बारे में बताईं', 'आपन रास्ता चुनीं', 'सुरक्षित शुरुआत करीं'],
  bho: ['आपन अगिला मौका इहे से शुरू होला।', 'पहिले आपन नाम बताईं। फेर चुनीं कि काम खोजत बानी या कामगार राखत बानी।', 'पहिला कदम', 'हम रउआ के कवन नाम से बोलाईं?', 'Rozgarmitra में देखाई देवे वाला नाम लिखीं।', 'रउआ के नाम', 'आपन नाम लिखीं', 'आगे बढ़ीं', 'अगिला स्क्रीन पर Worker या Job creator चुनीं।', 'कम से कम 2 अक्षर लिखीं।', 'अपना बारे बताईं', 'आपन राह चुनीं', 'सुरक्षित शुरुआत करीं'],
  ne: ['तपाईंको अर्को अवसर यहाँबाट सुरु हुन्छ।', 'पहिले आफ्नो नाम बताउनुहोस्। त्यसपछि तपाईं काम खोज्दै हुनुहुन्छ वा कामदार खोज्दै हुनुहुन्छ छान्नुहोस्।', 'पहिलो चरण', 'हामी तपाईंलाई कुन नामले बोलाऊँ?', 'Rozgarmitra मा देखिने नाम लेख्नुहोस्।', 'तपाईंको नाम', 'आफ्नो नाम लेख्नुहोस्', 'जारी राख्नुहोस्', 'अर्को स्क्रिनमा Worker वा Job creator छान्नुहोस्।', 'कम्तीमा २ अक्षर लेख्नुहोस्।', 'आफ्नो बारेमा बताउनुहोस्', 'आफ्नो बाटो छान्नुहोस्', 'सुरक्षित सुरुवात गर्नुहोस्'],
  kn: ['ನಿಮ್ಮ ಮುಂದಿನ ಅವಕಾಶ ಇಲ್ಲಿಂದ ಪ್ರಾರಂಭವಾಗುತ್ತದೆ.', 'ಮೊದಲು ನಿಮ್ಮ ಹೆಸರನ್ನು ತಿಳಿಸಿ. ನಂತರ ನೀವು ಕೆಲಸ ಹುಡುಕುತ್ತಿದ್ದೀರಾ ಅಥವಾ ಕೆಲಸಗಾರರನ್ನು ನೇಮಿಸುತ್ತಿದ್ದೀರಾ ಆಯ್ಕೆ ಮಾಡಿ.', 'ಮೊದಲ ಹೆಜ್ಜೆ', 'ನಿಮ್ಮನ್ನು ಯಾವ ಹೆಸರಿನಿಂದ ಕರೆಯಲಿ?', 'Rozgarmitra ನಲ್ಲಿ ಕಾಣಬೇಕಾದ ಹೆಸರನ್ನು ನಮೂದಿಸಿ.', 'ನಿಮ್ಮ ಹೆಸರು', 'ನಿಮ್ಮ ಹೆಸರನ್ನು ನಮೂದಿಸಿ', 'ಮುಂದುವರಿಸಿ', 'ಮುಂದಿನ ಪುಟದಲ್ಲಿ Worker ಅಥವಾ Job creator ಆಯ್ಕೆ ಮಾಡಿ.', 'ಕನಿಷ್ಠ 2 ಅಕ್ಷರಗಳನ್ನು ನಮೂದಿಸಿ.', 'ನಿಮ್ಮ ಬಗ್ಗೆ ತಿಳಿಸಿ', 'ನಿಮ್ಮ ದಾರಿ ಆಯ್ಕೆ ಮಾಡಿ', 'ಸುರಕ್ಷಿತವಾಗಿ ಪ್ರಾರಂಭಿಸಿ'],
  ml: ['നിങ്ങളുടെ അടുത്ത അവസരം ഇവിടെ തുടങ്ങുന്നു.', 'ആദ്യം നിങ്ങളുടെ പേര് പറയൂ. തുടർന്ന് ജോലി അന്വേഷിക്കുകയാണോ തൊഴിലാളിയെ നിയമിക്കുകയാണോ തിരഞ്ഞെടുക്കൂ.', 'ആദ്യ ഘട്ടം', 'ഏത് പേരിലാണ് നിങ്ങളെ വിളിക്കേണ്ടത്?', 'Rozgarmitra-യിൽ കാണേണ്ട പേര് നൽകൂ.', 'നിങ്ങളുടെ പേര്', 'പേര് നൽകൂ', 'തുടരുക', 'അടുത്ത സ്ക്രീനിൽ Worker അല്ലെങ്കിൽ Job creator തിരഞ്ഞെടുക്കൂ.', 'കുറഞ്ഞത് 2 അക്ഷരങ്ങൾ നൽകൂ.', 'നിങ്ങളെ പരിചയപ്പെടുത്തൂ', 'നിങ്ങളുടെ വഴി തിരഞ്ഞെടുക്കൂ', 'സുരക്ഷിതമായി തുടങ്ങൂ'],
  te: ['మీ తదుపరి అవకాశం ఇక్కడ ప్రారంభమవుతుంది.', 'ముందుగా మీ పేరు చెప్పండి. తర్వాత మీరు పని కోసం చూస్తున్నారా లేదా కార్మికులను నియమిస్తున్నారా ఎంచుకోండి.', 'మొదటి అడుగు', 'మిమ్మల్ని ఏ పేరుతో పిలవాలి?', 'Rozgarmitraలో కనిపించాలనుకునే పేరు నమోదు చేయండి.', 'మీ పేరు', 'మీ పేరు నమోదు చేయండి', 'కొనసాగించండి', 'తదుపరి స్క్రీన్‌లో Worker లేదా Job creator ఎంచుకోండి.', 'కనీసం 2 అక్షరాలు నమోదు చేయండి.', 'మీ గురించి చెప్పండి', 'మీ మార్గాన్ని ఎంచుకోండి', 'సురక్షితంగా ప్రారంభించండి'],
};

const welcomeKeys = ['welcomeTitle', 'welcomeSubtitle', 'firstStep', 'nameTitle', 'nameSubtitle', 'yourName', 'namePlaceholder', 'continue', 'nameNote', 'nameError', 'welcomePointOne', 'welcomePointTwo', 'welcomePointThree'];
const identityLabels = { en: 'Mobile number', hi: 'मोबाइल नंबर', pa: 'ਮੋਬਾਈਲ ਨੰਬਰ', mr: 'मोबाइल नंबर', bh: 'मोबाइल नंबर', bho: 'मोबाइल नंबर', ne: 'मोबाइल नम्बर', kn: 'ಮೊಬೈಲ್ ಸಂಖ್ಯೆ', ml: 'മൊബൈൽ നമ്പർ', te: 'మొబైల్ నంబర్' };

/**
 * Public marketing / registration site copy (routes /, /find-work, /register,
 * /job/:id, /terms, /privacy, /contact). Kept separate from the dashboard
 * translations so every language can override independently, with English as
 * the guaranteed fallback.
 */
const publicTranslations = {
  en: {
    brand: 'ROZGARMITRA', tagline: 'Local work. Real opportunity.',
    navHome: 'Home', navFindWork: 'Find Work', navRegister: 'Register as Worker',
    navMessageAdmin: 'Message Admin', navContactUs: 'Contact Us',
    heroLine1: 'Local work.', heroLine2: 'Real opportunity.',
    heroLead: 'Find work near you and connect directly with people who need your skills.',
    heroFindWork: 'Find Work', heroRegister: 'Register as Worker', heroNote: 'Trusted local connections',
    chooseKicker: 'CHOOSE A PATH', chooseTitle: 'What kind of work are you looking for?',
    nearbyKicker: 'NEARBY OPPORTUNITIES', nearbyTitle: 'Nearby Jobs', nearbySub: 'Work opportunities available near you',
    findKicker: 'FIND WORK', findTitle: 'Work that fits your day.', findLead: 'Choose a category and explore nearby opportunities.',
    viewJob: 'View Job', backToJobs: 'Back to jobs', askAdmin: 'Ask Admin About This Job',
    verifyNote: 'Contact the job creator to independently verify identity, wages and working conditions before accepting work.',
    regKicker: 'WORKER REGISTRATION', regTitle: 'Tell us how you work.',
    regLead: 'Create a simple profile so local opportunities can find you.',
    regSuccess: 'Registration saved. Your profile is ready for local opportunities.',
    regSubmit: 'Register as Worker', regNote: 'Your details are stored securely for this device.',
    fullName: 'Full Name', mobileNumber: 'Mobile Number', preferredLanguage: 'Preferred Language',
    yourLocation: 'Location', workCategory: 'Work Category', skills: 'Skills',
    experience: 'Experience', expectedWage: 'Expected daily wage', availability: 'Availability',
    selectCategory: 'Select category', availabilityHint: 'e.g. Monday to Saturday',
    noJobs: 'No nearby jobs found. Try another work category or location.',
    catConstruction: 'Construction', catCleaning: 'Cleaning', catLoading: 'Loading / Unloading',
    catFarm: 'Farm Work', catElectrician: 'Electrician', catCarpenter: 'Carpenter',
    catPainter: 'Painter', catOther: 'Other Work',
    termsTitle: 'Terms & Conditions', privacyTitle: 'Privacy Policy', contactTitle: 'Contact Us',
    contactLead: 'Connect with the admin team for help with jobs and worker registration.',
    contactMessage: 'Message Admin on WhatsApp', contactAddress: '[COMPANY ADDRESS TO BE ADDED]',
    contactEmail: '[COMPANY EMAIL TO BE ADDED]',
    footerRights: 'All rights reserved.',
    detectLocation: 'Detect my location', locationLoading: 'Detecting location…', locationUnavailable: 'Location unavailable',
    entryCta: 'Sign in to post or accept work',
  },
  hi: {
    brand: 'रोज़गारमित्र', tagline: 'स्थानीय काम। वास्तविक अवसर।',
    navHome: 'होम', navFindWork: 'काम खोजें', navRegister: 'कामगार के रूप में रजिस्टर करें',
    navMessageAdmin: 'एडमिन को संदेश', navContactUs: 'संपर्क करें',
    heroLine1: 'स्थानीय काम।', heroLine2: 'वास्तविक अवसर।',
    heroLead: 'अपने पास काम खोजें और सीधे उन लोगों से जुड़ें जिन्हें आपके कौशल की ज़रूरत है।',
    heroFindWork: 'काम खोजें', heroRegister: 'कामगार के रूप में रजिस्टर करें', heroNote: 'विश्वसनीय स्थानीय संपर्क',
    chooseKicker: 'अपना रास्ता चुनें', chooseTitle: 'आप किस तरह का काम ढूंढ रहे हैं?',
    nearbyKicker: 'आस-पास के अवसर', nearbyTitle: 'आस-पास के काम', nearbySub: 'आपके पास उपलब्ध काम के अवसर',
    findKicker: 'काम खोजें', findTitle: 'आपके दिन के अनुसार काम।', findLead: 'श्रेणी चुनें और आस-पास के अवसर देखें।',
    viewJob: 'काम देखें', backToJobs: 'काम पर वापस जाएं', askAdmin: 'इस काम के बारे में एडमिन से पूछें',
    verifyNote: 'काम स्वीकार करने से पहले पहचान, मज़दूरी और कार्य की स्थिति की स्वयं जाँच करें।',
    regKicker: 'कामगार पंजीकरण', regTitle: 'बताएं आप कैसे काम करते हैं।',
    regLead: 'एक साधारण प्रोफ़ाइल बनाएं ताकि स्थानीय अवसर आपको ढूंढ सकें।',
    regSuccess: 'पंजीकरण सहेजा गया। आपकी प्रोफ़ाइल स्थानीय अवसरों के लिए तैयार है।',
    regSubmit: 'कामगार के रूप में रजिस्टर करें', regNote: 'आपकी जानकारी इस डिवाइस पर सुरक्षित रूप से सहेजी जाती है।',
    fullName: 'पूरा नाम', mobileNumber: 'मोबाइल नंबर', preferredLanguage: 'पसंदीदा भाषा',
    yourLocation: 'स्थान', workCategory: 'काम की श्रेणी', skills: 'कौशल',
    experience: 'अनुभव', expectedWage: 'अपेक्षित दैनिक मज़दूरी', availability: 'उपलब्धता',
    selectCategory: 'श्रेणी चुनें', availabilityHint: 'जैसे सोमवार से शनिवार',
    noJobs: 'आस-पास कोई काम नहीं मिला। दूसरी श्रेणी या स्थान आज़माएं।',
    catConstruction: 'निर्माण', catCleaning: 'सफाई', catLoading: 'लोडिंग / अनलोडिंग',
    catFarm: 'खेती का काम', catElectrician: 'इलेक्ट्रीशियन', catCarpenter: 'बढ़ई',
    catPainter: 'पेंटर', catOther: 'अन्य काम',
    termsTitle: 'नियम और शर्तें', privacyTitle: 'गोपनीयता नीति', contactTitle: 'संपर्क करें',
    contactLead: 'काम और कामगार पंजीकरण में मदद के लिए एडमिन टीम से जुड़ें।',
    contactMessage: 'व्हाट्सएप पर एडमिन को संदेश भेजें', contactAddress: '[कंपनी का पता जोड़ा जाएगा]',
    contactEmail: '[कंपनी ईमेल जोड़ा जाएगा]',
    footerRights: 'सर्वाधिकार सुरक्षित।',
    detectLocation: 'मेरी लोकेशन पता लगाएं', locationLoading: 'लोकेशन पता लगा रहे हैं…', locationUnavailable: 'लोकेशन उपलब्ध नहीं',
    entryCta: 'ਕੰਮ ਪੋਸਟ ਕਰਨ ਜਾਂ ਸਵੀਕਾਰ ਕਰਨ ਲਈ ਸਾਈਨ ਇਨ ਕਰੋ',
  },
  pa: {
    brand: 'ਰੋਜ਼ਗਾਰਮਿਤਰ', tagline: 'ਸਥਾਨਕ ਕੰਮ। ਅਸਲੀ ਮੌਕਾ।',
    navHome: 'ਹੋਮ', navFindWork: 'ਕੰਮ ਲੱਭੋ', navRegister: 'ਕਾਮਗਾਰ ਵਜੋਂ ਰਜਿਸਟਰ ਕਰੋ',
    navMessageAdmin: 'ਐਡਮਿਨ ਨੂੰ ਸੁਨੇਹਾ', navContactUs: 'ਸੰਪਰਕ ਕਰੋ',
    heroLine1: 'ਸਥਾਨਕ ਕੰਮ।', heroLine2: 'ਅਸਲੀ ਮੌਕਾ।',
    heroLead: 'ਆਪਣੇ ਨੇੜੇ ਕੰਮ ਲੱਭੋ ਅਤੇ ਸਿੱਧੇ ਉਨ੍ਹਾਂ ਨਾਲ ਜੁੜੋ ਜਿਨ੍ਹਾਂ ਨੂੰ ਤੁਹਾਡੇ ਹੁਨਰ ਦੀ ਲੋੜ ਹੈ।',
    heroFindWork: 'ਕੰਮ ਲੱਭੋ', heroRegister: 'ਕਾਮਗਾਰ ਵਜੋਂ ਰਜਿਸਟਰ ਕਰੋ', heroNote: 'ਭਰੋਸੇਯੋਗ ਸਥਾਨਕ ਸੰਪਰਕ',
    chooseKicker: 'ਆਪਣਾ ਰਾਹ ਚੁਣੋ', chooseTitle: 'ਤੁਸੀਂ ਕਿਸ ਤਰ੍ਹਾਂ ਦਾ ਕੰਮ ਲੱਭ ਰਹੇ ਹੋ?',
    nearbyKicker: 'ਨੇੜਲੇ ਮੌਕੇ', nearbyTitle: 'ਨੇੜਲੇ ਕੰਮ', nearbySub: 'ਤੁਹਾਡੇ ਨੇੜੇ ਉਪਲਬਧ ਕੰਮ ਦੇ ਮੌਕੇ',
    findKicker: 'ਕੰਮ ਲੱਭੋ', findTitle: 'ਤੁਹਾਡੇ ਦਿਨ ਲਈ ਢੁੱਕਵਾਂ ਕੰਮ।', findLead: 'ਸ਼੍ਰੇਣੀ ਚੁਣੋ ਅਤੇ ਨੇੜਲੇ ਮੌਕੇ ਵੇਖੋ।',
    viewJob: 'ਕੰਮ ਵੇਖੋ', backToJobs: 'ਕੰਮਾਂ ਤੇ ਵਾਪਸ', askAdmin: 'ਇਸ ਕੰਮ ਬਾਰੇ ਐਡਮਿਨ ਤੋਂ ਪੁੱਛੋ',
    verifyNote: 'ਕੰਮ ਸਵੀਕਾਰ ਕਰਨ ਤੋਂ ਪਹਿਲਾਂ ਪਛਾਣ, ਮਜ਼ਦੂਰੀ ਅਤੇ ਕੰਮ ਦੀਆਂ ਹਾਲਤਾਂ ਦੀ ਖੁਦ ਜਾਂਚ ਕਰੋ।',
    regKicker: 'ਕਾਮਗਾਰ ਪੰਜੀਕਰਨ', regTitle: 'ਦੱਸੋ ਤੁਸੀਂ ਕਿਵੇਂ ਕੰਮ ਕਰਦੇ ਹੋ।',
    regLead: 'ਇੱਕ ਸਧਾਰਨ ਪ੍ਰੋਫਾਈਲ ਬਣਾਓ ਤਾਂ ਜੋ ਸਥਾਨਕ ਮੌਕੇ ਤੁਹਾਨੂੰ ਲੱਭ ਸਕਣ।',
    regSuccess: 'ਪੰਜੀਕਰਨ ਸੰਭਾਲ ਲਿਆ ਗਿਆ। ਤੁਹਾਡੀ ਪ੍ਰੋਫਾਈਲ ਸਥਾਨਕ ਮੌਕਿਆਂ ਲਈ ਤਿਆਰ ਹੈ।',
    regSubmit: 'ਕਾਮਗਾਰ ਵਜੋਂ ਰਜਿਸਟਰ ਕਰੋ', regNote: 'ਤੁਹਾਡੀ ਜਾਣਕਾਰੀ ਇਸ ਡਿਵਾਈਸ ਤੇ ਸੁਰੱਖਿਅਤ ਰੂਪ ਵਿੱਚ ਸੰਭਾਲੀ ਜਾਂਦੀ ਹੈ।',
    fullName: 'ਪੂਰਾ ਨਾਮ', mobileNumber: 'ਮੋਬਾਈਲ ਨੰਬਰ', preferredLanguage: 'ਪਸੰਦੀਦਾ ਭਾਸ਼ਾ',
    yourLocation: 'ਸਥਾਨ', workCategory: 'ਕੰਮ ਦੀ ਸ਼੍ਰੇਣੀ', skills: 'ਹੁਨਰ',
    experience: 'ਤਜਰਬਾ', expectedWage: 'ਉਮੀਦ ਰੋਜ਼ਾਨਾ ਮਜ਼ਦੂਰੀ', availability: 'ਉਪਲਬਧਤਾ',
    selectCategory: 'ਸ਼੍ਰੇਣੀ ਚੁਣੋ', availabilityHint: 'ਜਿਵੇਂ ਸੋਮਵਾਰ ਤੋਂ ਸ਼ਨਿਵਾਰ',
    noJobs: 'ਨੇੜੇ ਕੋਈ ਕੰਮ ਨਹੀਂ ਮਿਲਿਆ। ਹੋਰ ਸ਼੍ਰੇਣੀ ਜਾਂ ਸਥਾਨ ਅਜ਼ਮਾਓ।',
    catConstruction: 'ਨਿਰਮਾਣ', catCleaning: 'ਸਫ਼ਾਈ', catLoading: 'ਲੋਡਿੰਗ / ਅਨਲੋਡਿੰਗ',
    catFarm: 'ਖੇਤੀ ਦਾ ਕੰਮ', catElectrician: 'ਇਲੈਕਟ੍ਰੀਸ਼ਿਅਨ', catCarpenter: 'ਲੱਕਾਰ',
    catPainter: 'ਪੇਂਟਰ', catOther: 'ਹੋਰ ਕੰਮ',
    termsTitle: 'ਨਿਯਮ ਅਤੇ ਸ਼ਰਤਾਂ', privacyTitle: 'ਪਰਦੇਦਾਰੀ ਨੀਤੀ', contactTitle: 'ਸੰਪਰਕ ਕਰੋ',
    contactLead: 'ਕੰਮ ਅਤੇ ਕਾਮਗਾਰ ਪੰਜੀਕਰਨ ਵਿੱਚ ਮਦਦ ਲਈ ਐਡਮਿਨ ਟੀਮ ਨਾਲ ਜੁੜੋ।',
    contactMessage: 'ਵਟਸਐਪ ਤੇ ਐਡਮਿਨ ਨੂੰ ਸੁਨੇਹਾ ਭੇਜੋ', contactAddress: '[ਕੰਪਨੀ ਦਾ ਪਤਾ ਜੋੜਿਆ ਜਾਵੇਗਾ]',
    contactEmail: '[ਕੰਪਨੀ ਈਮੇਲ ਜੋੜਿਆ ਜਾਵੇਗਾ]',
    footerRights: 'ਸਾਰੇ ਹਕ ਸੰਭਾਲੇ ਗਏ।',
    detectLocation: 'ਮੇਰੀ ਲੋਕੇਸ਼ਨ ਲੱਭੋ', locationLoading: 'ਲੋਕੇਸ਼ਨ ਲੱਭ ਰਹੇ ਹਾਂ…', locationUnavailable: 'ਲੋਕੇਸ਼ਨ ਉਪਲਬਧ ਨਹੀਂ',
    entryCta: 'ਕੰਮ ਪੋਸਟ ਕਰਨ ਜਾਂ ਸਵੀਕਾਰ ਕਰਨ ਲਈ ਸਾਈਨ ਇਨ ਕਰੋ',
  },
};

// Languages without dedicated public copy fall back to English instead of
// rendering raw translation keys.
for (const code of LANGUAGES.map((item) => item.code)) {
  if (!publicTranslations[code]) publicTranslations[code] = publicTranslations.en;
}

/** Maps a jobsData category name to its translation key. */
const categoryKeyByName = {
  Construction: 'catConstruction',
  Cleaning: 'catCleaning',
  'Loading / Unloading': 'catLoading',
  'Farm Work': 'catFarm',
  Electrician: 'catElectrician',
  Carpenter: 'catCarpenter',
  Painter: 'catPainter',
  'Other Work': 'catOther',
};

const aliases = {};

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => localStorage.getItem('rm_language') || 'en');
  const setLanguage = (code) => { localStorage.setItem('rm_language', code); setLanguageState(code); };
  const t = (key) => {
    if (key === 'mobilePending') return identityLabels[language] || identityLabels.en;
    const welcomeIndex = welcomeKeys.indexOf(key);
    if (welcomeIndex >= 0) return welcomeTranslations[language]?.[welcomeIndex] || welcomeTranslations.en[welcomeIndex];
    return (
      statusTranslations[language]?.[key] ||
      publicTranslations[language]?.[key] ||
      publicTranslations.en?.[key] ||
      translations[language]?.[key] ||
      translations[aliases[language] || 'en']?.[key] ||
      translations.en[key] ||
      key
    );
  };
  /** Localised label for a jobsData category name. */
  const tCategory = (name) => t(categoryKeyByName[name] || 'category');
  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, tCategory }}>
      {children}
    </LanguageContext.Provider>
  );
}

