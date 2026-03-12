curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb


cloudflared tunnel login



cloudflared tunnel create firetech-tunnel
# This connects his local Node.js port (3000) to a Cloudflare URL
cloudflared tunnel serve --url http://localhost:3000


4. The Result
Cloudflare will give him a random URL like https://funny-unicorn-123.trycloudflare.com.

HTTPS is automatic: Cloudflare handles the certificate.

Bypasses College Security: Because the connection starts inside the college and goes out, the firewall usually allows it.
