const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { JSDOM } = require('jsdom');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

require('dotenv').config();
const API_KEY = process.env.API_KEY;
const auth = (req, res, next) => {
    const key = req.headers['x-api-key'];
    if (key !== API_KEY) return res.status(401).json({ error: 'Invalid API Key' });
    next();
};

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50 });
app.use('/api/', limiter);

const BUSINESS_TYPE_RULES = {
    ecommerce: {
        name: 'E-Commerce', icon: '🛒', color: '#FF6B35',
        description: 'Online store selling products/services',
        indicators: [
            { pattern: /add.to.cart|addtocart|buy.now|checkout/gi, weight: 10 },
            { pattern: /price|discount|offer|sale|deal/gi, weight: 8 },
            { pattern: /product|category|shop|store/gi, weight: 7 },
            { pattern: /shipping|delivery|refund|exchange/gi, weight: 9 },
            { pattern: /payment|upi|wallet|cod/gi, weight: 8 },
            { pattern: /wishlist|compare|review|rating/gi, weight: 6 },
            { pattern: /order|tracking|invoice|purchase/gi, weight: 7 },
            { pattern: /amazon|flipkart|myntra|ajio/gi, weight: 5 }
        ],
        requiredLegalPages: [
            { page: 'Privacy Policy', priority: 'CRITICAL', reason: 'DPDP Act mandatory', regulation: 'DPDP Act 2023' },
            { page: 'Refund Policy', priority: 'CRITICAL', reason: 'Consumer Protection Act', regulation: 'CPA 2019' },
            { page: 'Terms of Service', priority: 'CRITICAL', reason: 'IT Act requirements', regulation: 'IT Act 2000' },
            { page: 'Shipping Policy', priority: 'HIGH', reason: 'E-Commerce Rules', regulation: 'E-Commerce Rules 2020' },
            { page: 'Cancellation Policy', priority: 'HIGH', reason: 'Consumer rights', regulation: 'CPA 2019' },
            { page: 'Cookie Policy', priority: 'MEDIUM', reason: 'Tracking tech', regulation: 'IT Rules 2021' }
        ],
        applicableRegulations: ['DPDP Act 2023', 'IT Act 2000', 'CPA 2019', 'E-Commerce Rules 2020'],
        complianceScoreWeights: { privacy: 25, security: 20, consumer: 25, operations: 15, transparency: 15 }
    },
    saas: {
        name: 'SaaS/Tech', icon: '☁️', color: '#4ECDC4',
        description: 'Software-as-a-Service platform',
        indicators: [
            { pattern: /sign.up|free.trial|get.started/gi, weight: 7 },
            { pattern: /login|signin|authentication/gi, weight: 6 },
            { pattern: /pricing|subscription|billing/gi, weight: 9 },
            { pattern: /api|developer|integration|sdk/gi, weight: 8 },
            { pattern: /dashboard|analytics|report/gi, weight: 7 }
        ],
        requiredLegalPages: [
            { page: 'Privacy Policy', priority: 'CRITICAL', reason: 'User data processing', regulation: 'DPDP Act 2023' },
            { page: 'Terms of Service', priority: 'CRITICAL', reason: 'SaaS contracts', regulation: 'IT Act 2000' },
            { page: 'Acceptable Use Policy', priority: 'HIGH', reason: 'Prevent abuse', regulation: 'IT Act 2000' },
            { page: 'SLA Policy', priority: 'HIGH', reason: 'Service levels', regulation: 'Contract Law' },
            { page: 'Security Practices', priority: 'HIGH', reason: 'Enterprise trust', regulation: 'ISO 27001' }
        ],
        applicableRegulations: ['DPDP Act 2023', 'IT Act 2000', 'ISO 27001'],
        complianceScoreWeights: { privacy: 30, security: 30, consumer: 15, operations: 15, transparency: 10 }
    },
    blog: {
        name: 'Blog/Content', icon: '📝', color: '#A8E6CF',
        description: 'Content publishing website',
        indicators: [
            { pattern: /article|post|blog|news|content/gi, weight: 8 },
            { pattern: /author|writer|editorial/gi, weight: 7 },
            { pattern: /comment|discussion|thread/gi, weight: 6 },
            { pattern: /subscribe|newsletter|rss/gi, weight: 7 }
        ],
        requiredLegalPages: [
            { page: 'Privacy Policy', priority: 'CRITICAL', reason: 'Analytics data', regulation: 'DPDP Act 2023' },
            { page: 'Disclaimer', priority: 'HIGH', reason: 'Content protection', regulation: 'IT Act 2000' },
            { page: 'Cookie Policy', priority: 'MEDIUM', reason: 'Cookies', regulation: 'IT Rules 2021' }
        ],
        applicableRegulations: ['DPDP Act 2023', 'IT Act 2000', 'Copyright Law'],
        complianceScoreWeights: { privacy: 20, security: 10, consumer: 10, operations: 10, transparency: 50 }
    },
    finance: {
        name: 'Finance/Fintech', icon: '💰', color: '#FFD93D',
        description: 'Financial services platform',
        indicators: [
            { pattern: /loan|emi|credit|interest/gi, weight: 10 },
            { pattern: /invest|stock|trading|portfolio/gi, weight: 10 },
            { pattern: /insurance|premium|claim/gi, weight: 9 },
            { pattern: /banking|account|upi|kyc/gi, weight: 9 },
            { pattern: /rbi|sebi|regulated/gi, weight: 8 }
        ],
        requiredLegalPages: [
            { page: 'Privacy Policy', priority: 'CRITICAL', reason: 'Financial data', regulation: 'DPDP Act 2023' },
            { page: 'Risk Disclosure', priority: 'CRITICAL', reason: 'SEBI mandatory', regulation: 'SEBI' },
            { page: 'Terms of Service', priority: 'CRITICAL', reason: 'Financial agreements', regulation: 'RBI' },
            { page: 'Grievance Redressal', priority: 'CRITICAL', reason: 'RBI Ombudsman', regulation: 'RBI' },
            { page: 'KYC Policy', priority: 'CRITICAL', reason: 'Identity verification', regulation: 'PMLA' }
        ],
        applicableRegulations: ['RBI', 'SEBI', 'PMLA', 'DPDP Act 2023', 'IRDAI'],
        complianceScoreWeights: { privacy: 25, security: 30, consumer: 20, operations: 15, transparency: 10 }
    },
    healthcare: {
        name: 'Healthcare', icon: '🏥', color: '#FF6B6B',
        description: 'Medical/health platform',
        indicators: [
            { pattern: /doctor|physician|consultation/gi, weight: 9 },
            { pattern: /medicine|pharmacy|prescription/gi, weight: 9 },
            { pattern: /hospital|clinic|diagnostic/gi, weight: 8 },
            { pattern: /patient|medical.record|symptom/gi, weight: 8 },
            { pattern: /telehealth|video.consult/gi, weight: 8 }
        ],
        requiredLegalPages: [
            { page: 'Privacy Policy', priority: 'CRITICAL', reason: 'Health data', regulation: 'DPDP Act 2023' },
            { page: 'Medical Disclaimer', priority: 'CRITICAL', reason: 'Not medical advice', regulation: 'MCI' },
            { page: 'Patient Consent', priority: 'CRITICAL', reason: 'Explicit consent', regulation: 'DPDP Act 2023' },
            { page: 'Data Security', priority: 'CRITICAL', reason: 'Health records', regulation: 'IT Act 2000' },
            { page: 'Emergency Notice', priority: 'HIGH', reason: 'Emergency redirect', regulation: 'Clinical Establishment' }
        ],
        applicableRegulations: ['DPDP Act 2023', 'Clinical Establishment Act', 'MCI', 'Drugs & Cosmetics Act'],
        complianceScoreWeights: { privacy: 35, security: 30, consumer: 15, operations: 10, transparency: 10 }
    },
    education: {
        name: 'Education/EdTech', icon: '🎓', color: '#6C5CE7',
        description: 'Educational platform',
        indicators: [
            { pattern: /course|lesson|curriculum|syllabus/gi, weight: 8 },
            { pattern: /student|enroll|admission/gi, weight: 7 },
            { pattern: /certificate|degree|accreditation/gi, weight: 8 },
            { pattern: /exam|test|quiz|assessment/gi, weight: 6 },
            { pattern: /parent|minor|child/gi, weight: 7 }
        ],
        requiredLegalPages: [
            { page: 'Privacy Policy', priority: 'CRITICAL', reason: 'Student data', regulation: 'DPDP Act 2023' },
            { page: 'Parental Consent', priority: 'CRITICAL', reason: 'Minor data', regulation: 'DPDP Act 2023' },
            { page: 'Terms of Service', priority: 'HIGH', reason: 'Enrollment terms', regulation: 'CPA 2019' },
            { page: 'Refund Policy', priority: 'HIGH', reason: 'Fee refunds', regulation: 'CPA 2019' }
        ],
        applicableRegulations: ['DPDP Act 2023', 'CPA 2019', 'UGC/AICTE'],
        complianceScoreWeights: { privacy: 30, security: 20, consumer: 20, operations: 15, transparency: 15 }
    }
};

function detectBusinessType(htmlContent, url) {
    const text = htmlContent.toLowerCase();
    const urlLower = url.toLowerCase();
    const scores = {};

    for (const [type, config] of Object.entries(BUSINESS_TYPE_RULES)) {
        scores[type] = 0;
        for (const indicator of config.indicators) {
            const matches = text.match(indicator.pattern);
            if (matches) scores[type] += indicator.weight * matches.length;
            if (indicator.pattern.test(urlLower)) scores[type] += indicator.weight * 2;
        }
    }

    let bestType = 'portfolio';
    let bestScore = 0;
    for (const [type, score] of Object.entries(scores)) {
        if (score > bestScore) { bestScore = score; bestType = type; }
    }

    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
    const confidence = totalScore > 0 ? Math.round((bestScore / totalScore) * 100) : 0;

    return { primaryType: bestType, confidence, config: BUSINESS_TYPE_RULES[bestType] };
}

function calculateComplianceScore(detectedType, legalPages) {
    const config = BUSINESS_TYPE_RULES[detectedType];
    if (!config) return { score: 0, grade: 'N/A' };

    const hasPrivacy = legalPages.some(p => p.name.toLowerCase().includes('privacy'));
    const hasTerms = legalPages.some(p => p.name.toLowerCase().includes('term'));
    const hasRefund = legalPages.some(p => p.name.toLowerCase().includes('refund'));

    let score = 0;
    if (hasPrivacy) score += 30;
    if (hasTerms) score += 25;
    if (hasRefund) score += 20;
    score += Math.min(25, legalPages.length * 5);

    let grade = 'F';
    if (score >= 90) grade = 'A+';
    else if (score >= 80) grade = 'A';
    else if (score >= 70) grade = 'B';
    else if (score >= 60) grade = 'C';
    else if (score >= 40) grade = 'D';

    return { score, grade };
}

async function scanWebsite(url) {
    console.log(`Scanning: ${url}`);
    const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LegalGen-V2/1.0)' },
        timeout: 15000
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const title = document.querySelector('title')?.textContent?.trim() || 'No Title';
    const businessDetection = detectBusinessType(html, url);

    const technologies = [];
    if (html.includes('wp-content')) technologies.push({ name: 'WordPress', category: 'CMS' });
    if (html.includes('shopify')) technologies.push({ name: 'Shopify', category: 'E-commerce' });
    if (html.includes('react') || html.includes('__NEXT_DATA__')) technologies.push({ name: 'React/Next.js', category: 'Framework' });
    if (html.includes('google-analytics') || html.includes('gtag(')) technologies.push({ name: 'Google Analytics', category: 'Analytics' });
    if (html.includes('stripe.com')) technologies.push({ name: 'Stripe', category: 'Payments' });
    if (html.includes('razorpay.com')) technologies.push({ name: 'Razorpay', category: 'Payments' });
    if (html.includes('facebook.com/tr')) technologies.push({ name: 'Facebook Pixel', category: 'Marketing' });
    if (html.includes('cloudflare')) technologies.push({ name: 'Cloudflare', category: 'CDN' });

    const forms = [];
    document.querySelectorAll('form').forEach((form, index) => {
        const inputs = form.querySelectorAll('input, textarea, select');
        const fields = [];
        inputs.forEach(input => {
            const type = input.getAttribute('type') || input.tagName.toLowerCase();
            if (type !== 'hidden' && type !== 'submit') fields.push(type);
        });
        if (fields.length > 0) forms.push({ id: index, fields, fieldCount: fields.length });
    });

    const legalKeywords = ['privacy', 'terms', 'cookie', 'refund', 'cancel', 'shipping', 'disclaimer', 'grievance', 'about', 'contact', 'faq', 'policy'];
    const legalPages = [];
    document.querySelectorAll('a[href]').forEach(link => {
        const href = link.getAttribute('href');
        const text = link.textContent.trim().toLowerCase();
        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
            const isLegal = legalKeywords.some(k => text.includes(k) || href.toLowerCase().includes(k));
            if (isLegal) {
                try {
                    legalPages.push({
                        name: link.textContent.trim(),
                        url: new URL(href, url).toString(),
                        isLegalPage: true
                    });
                } catch (e) { }
            }
        }
    });

    const complianceScore = calculateComplianceScore(businessDetection.primaryType, legalPages);
    const missingPages = businessDetection.config.requiredLegalPages.filter(req =>
        !legalPages.some(p => p.name.toLowerCase().includes(req.page.toLowerCase()))
    );

    let riskLevel = 'LOW';
    if (complianceScore.score < 30 || missingPages.filter(m => m.priority === 'CRITICAL').length >= 3) riskLevel = 'CRITICAL';
    else if (complianceScore.score < 50 || missingPages.filter(m => m.priority === 'CRITICAL').length >= 2) riskLevel = 'HIGH';
    else if (complianceScore.score < 70) riskLevel = 'MEDIUM';

    return {
        version: '2.0-pro',
        scannedAt: new Date().toISOString(),
        url,
        basicInfo: { title, wordCount: html.split(/\s+/).length },
        businessDetection: {
            type: businessDetection.config.name,
            typeKey: businessDetection.primaryType,
            icon: businessDetection.config.icon,
            color: businessDetection.config.color,
            confidence: businessDetection.confidence,
            applicableRegulations: businessDetection.config.applicableRegulations
        },
        complianceScore: {
            overall: complianceScore.score,
            grade: complianceScore.grade
        },
        riskLevel,
        technologies,
        forms,
        legalPages: { found: legalPages, count: legalPages.length },
        missingPages: {
            required: missingPages,
            count: missingPages.length,
            totalRequired: businessDetection.config.requiredLegalPages.length
        },
        recommendations: missingPages.map(m => ({
            type: 'MISSING_REQUIRED',
            priority: m.priority,
            page: m.page,
            reason: m.reason,
            regulation: m.regulation
        }))
    };
}

app.get('/api/health', (req, res) => {
    res.json({ status: 'healthy', version: '2.0-pro', timestamp: new Date().toISOString() });
});

app.post('/api/scan', auth, async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL is required' });

        console.log(`\\n=== LegalGen V2 PRO Scan ===`);
        console.log(`Target: ${url}`);

        const result = await scanWebsite(url);

        console.log(`✅ Detected: ${result.businessDetection.type} (${result.businessDetection.confidence}%)`);
        console.log(`📊 Score: ${result.complianceScore.overall}/100 (${result.complianceScore.grade})`);
        console.log(`⚠️  Risk: ${result.riskLevel}`);
        console.log(`📄 Missing: ${result.missingPages.count}/${result.missingPages.totalRequired}\\n`);

        res.json({ success: true, data: result });
    } catch (error) {
        console.error('❌ Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║                                        ║
║   🚀 LegalGen V2 PRO Scanner          ║
║   📍 http://localhost:${PORT}           ║
║   🔑 Key: ${API_KEY}                   ║
║                                        ║
╚════════════════════════════════════════╝
    `);
});
