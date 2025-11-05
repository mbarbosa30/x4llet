# Deploying x4llet to Production

This guide explains how to deploy x4llet to production and configure the x4llet.com custom domain.

## Prerequisites

- Replit project with x4llet application
- Access to x4llet.com domain registrar (for DNS configuration)
- Application is working correctly in development mode

## Step 1: Prepare for Deployment

Before deploying, ensure:

1. ✅ Application runs without errors in development mode
2. ✅ All features are tested and working
3. ✅ Environment secrets are properly configured:
   - `DATABASE_URL` (for PostgreSQL)
   - `SESSION_SECRET` (for session management)
   - `FACILITATOR_PRIVATE_KEY` (for gasless transactions)
   - `ETHERSCAN_API_KEY` (for transaction history)
   - Network-specific API keys if needed

## Step 2: Choose Deployment Type

Replit offers several deployment types. For x4llet, we recommend:

### **Autoscale Deployment** (Recommended)
- Automatically scales based on traffic
- Cost-effective for variable usage
- Perfect for PWAs with unpredictable traffic patterns
- Handles multiple users efficiently

### Alternative: **Reserved VM Deployment**
- Dedicated resources with consistent performance
- Use if you expect steady, high traffic
- More predictable costs

## Step 3: Publish Your Application

1. **Open Deployments**
   - Click the **"Publish"** button at the top of your Replit workspace
   - Or press `Cmd/Ctrl + K` and search for "Deployments"

2. **Configure Deployment Settings**
   
   **For Autoscale Deployment:**
   - **Deployment name**: `x4llet-production`
   - **Machine type**: Select based on expected load (start with smallest, scale up if needed)
   - **Max instances**: 3-5 (prevents runaway costs while allowing scaling)
   - **Run command**: Should auto-detect `npm run dev` (or configure as needed)
   - **Port**: Application runs on port 5000 (Vite default)
   
   **Important Configuration:**
   - Ensure your app binds to `0.0.0.0:5000` (already configured in x4llet)
   - Do NOT bind to `localhost` (won't be accessible externally)
   - Environment variables are automatically copied from development

3. **Review and Publish**
   - Review all settings
   - Click **"Publish"**
   - Wait for deployment to complete (usually 1-3 minutes)
   - You'll receive a temporary URL: `https://x4llet-production.<username>.replit.app`

4. **Test Deployed Application**
   - Visit the temporary URL
   - Test wallet creation, sending, receiving
   - Verify all features work in production environment
   - Check browser console for errors

## Step 4: Configure Custom Domain (x4llet.com)

### 4.1 Add Domain in Replit

1. **Open Deployment Settings**
   - Go to your deployed application
   - Click the **"Deployments"** tab
   - Select your deployment
   - Click **"Settings"**

2. **Add Custom Domain**
   - Scroll to **"Custom Domains"** section
   - Click **"Add Domain"**
   - Enter: `x4llet.com`
   - Click **"Add"**

3. **Note DNS Records**
   Replit will provide DNS records to configure. You'll need:
   
   **A Record:**
   ```
   Type: A
   Name: @ (or leave blank for root domain)
   Value: <IP address provided by Replit>
   TTL: 3600 (or automatic)
   ```
   
   **CNAME Record (for www):**
   ```
   Type: CNAME
   Name: www
   Value: <hostname provided by Replit>
   TTL: 3600
   ```
   
   **TXT Record (for verification):**
   ```
   Type: TXT
   Name: @ (or _replit)
   Value: <verification string provided by Replit>
   TTL: 3600
   ```

### 4.2 Configure DNS at Domain Registrar

1. **Login to Domain Registrar**
   - Access your domain registrar where you purchased x4llet.com
   - Navigate to DNS settings / DNS management

2. **Add DNS Records**
   - Add the A record (points x4llet.com to Replit's IP)
   - Add the CNAME record (points www.x4llet.com to Replit)
   - Add the TXT record (verifies domain ownership)
   
   **Important:**
   - Remove any conflicting A or CNAME records pointing elsewhere
   - If you have existing records for @, replace them
   - Save/publish changes

3. **Wait for DNS Propagation**
   - DNS changes can take 5 minutes to 48 hours
   - Usually completes within 1-2 hours
   - Use https://dnschecker.org to check propagation status

### 4.3 Verify Domain in Replit

1. **Check Verification Status**
   - Return to Replit Deployments → Settings → Custom Domains
   - Status should change from "Pending" to "Verified"
   - If stuck on "Pending" after 2 hours, check DNS records

2. **SSL Certificate**
   - Replit automatically provisions SSL/TLS certificate
   - Your site will be accessible via HTTPS
   - Certificate auto-renews

## Step 5: Test Production Domain

Once domain is verified:

1. Visit `https://x4llet.com`
2. Test all functionality:
   - Wallet creation and restoration
   - Balance viewing
   - Sending USDC (online mode)
   - Receiving USDC (payment requests)
   - Offline payment flow
   - PWA installation
3. Test on multiple devices (desktop, mobile)
4. Verify social sharing works correctly (check Open Graph preview)

## Step 6: Monitor and Maintain

### Application Monitoring

- **Check Deployment Logs**: Deployments tab → Logs
- **Monitor Performance**: Check response times and errors
- **Scale as Needed**: Adjust max instances for Autoscale if needed

### Database Backups

- Replit automatically backs up PostgreSQL databases
- For additional safety, export database periodically
- Test restoration process

### Environment Secrets

- Rotate `SESSION_SECRET` periodically
- Monitor `FACILITATOR_PRIVATE_KEY` wallet balance (needs gas for transactions)
- Keep API keys up to date

## Troubleshooting

### Domain Not Working

**Problem**: x4llet.com doesn't load after DNS configuration

**Solutions**:
1. Check DNS records are correct (use `nslookup x4llet.com`)
2. Wait longer for DNS propagation (can take up to 48 hours)
3. Clear browser DNS cache: Chrome → `chrome://net-internals/#dns` → Clear
4. Try incognito/private browsing mode
5. Verify TXT record for domain verification

### Application Errors

**Problem**: App works in development but not production

**Solutions**:
1. Check deployment logs for errors
2. Verify all environment secrets are set
3. Ensure database is accessible (check DATABASE_URL)
4. Verify FACILITATOR_PRIVATE_KEY wallet has sufficient gas funds
5. Check API keys (ETHERSCAN_API_KEY) are valid

### SSL Certificate Issues

**Problem**: Certificate errors or "Not Secure" warning

**Solutions**:
1. Wait for Replit to provision SSL (can take 10-30 minutes after verification)
2. Verify domain is fully verified in Replit
3. Try force-refresh: `Ctrl/Cmd + Shift + R`

### PWA Installation Not Working

**Problem**: Can't install x4llet as PWA on mobile

**Solutions**:
1. Ensure you're accessing via HTTPS (not HTTP)
2. Clear browser cache and try again
3. Verify manifest.json is served correctly
4. Check service worker registration in browser DevTools

## Production Checklist

Before announcing x4llet.com to users:

- [ ] Domain x4llet.com loads correctly
- [ ] HTTPS certificate is active and valid
- [ ] All environment secrets are configured
- [ ] Database is accessible and working
- [ ] Wallet creation works
- [ ] Balance viewing works (Base and Celo)
- [ ] Sending USDC works (online mode)
- [ ] Receiving USDC works (payment requests)
- [ ] Offline payment flow works
- [ ] PWA installation works on iOS and Android
- [ ] Social sharing shows correct Open Graph image
- [ ] Facilitator wallet has sufficient gas funds
- [ ] Application performance is acceptable
- [ ] No errors in browser console
- [ ] No errors in deployment logs

## Support

If you encounter issues not covered in this guide:

1. Check Replit deployment logs for specific error messages
2. Review Replit documentation: https://docs.replit.com/
3. Test in development mode to isolate production-specific issues
4. Verify all secrets and environment variables are correct

## Updates and Redeployment

To update x4llet after making changes:

1. Make changes in your Replit workspace
2. Test thoroughly in development mode
3. Go to Deployments tab
4. Click **"Redeploy"** on your active deployment
5. Wait for redeployment to complete
6. Test changes on x4llet.com

Changes are deployed automatically without needing to reconfigure DNS.

---

**Production URL**: https://x4llet.com  
**Development/Testing URL**: https://x4llet-production.<username>.replit.app  
**API Endpoints**: Served from same domain (no CORS issues)
